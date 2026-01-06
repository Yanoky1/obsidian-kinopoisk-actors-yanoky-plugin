/**
 * main.ts
 *
 * Main plugin class for Kinopoisk API integration in Obsidian.
 * Coordinates the entire workflow of searching and creating /series notes.
 */

import { Notice, Plugin, MarkdownView, TFile, TAbstractFile } from "obsidian";
import { SearchModal } from "Views/search_modal";
import { ItemsSuggestModal } from "Views/suggest_modal";
import { KinopoiskSuggestItem } from "Models/kinopoisk_response";
import { MovieShow } from "Models/MovieShow.model";
import {
	ObsidianKinopoiskPluginSettings,
	DEFAULT_SETTINGS,
	ObsidianKinopoiskSettingTab,
} from "Settings/settings";
import {
	makeFileName,
	getTemplateContents,
	replaceVariableSyntax,
} from "Utils/utils";
import { CursorJumper } from "Utils/cursor_jumper";
import { initializeLanguage } from "./i18n";
import { getByQuery, getMovieShowById } from "APIProvider/provider";

export default class ObsidianKinopoiskPlugin extends Plugin {
	settings: ObsidianKinopoiskPluginSettings;

	async onload() {
		await this.loadSettings();

		// Initialize language from settings or auto-detect
		initializeLanguage(this.settings.language);

		this.addRibbonIcon("circle-user-round", "Search in Kinopoisk actors", () => {
			this.createNewNote();
		});

		this.addCommand({
			id: "open-search-kinopoisk-modal",
			name: "Search",
			callback: () => {
				this.createNewNote();
			},
		});

		this.addCommand({
			id: "search-current-actor-name",
			name: "Search by current actor name",
			checkCallback: (checking: boolean) => {
				const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (activeView) {
					if (!checking) {
						this.searchByCurrentActorName();
					}
					return true;
				}
				return false;
			},
		});

		// Отслеживаем создание новых файлов
		this.registerEvent(
			this.app.vault.on('create', (file: TAbstractFile) => {
				// Проверяем, что это файл, а не папка
				if (file instanceof TFile) {
					this.onFileCreated(file);
				}
			})
		);

		this.addSettingTab(new ObsidianKinopoiskSettingTab(this.app, this));
	}

	// Shows error notification to user
	showNotice(error: Error) {
		try {
			new Notice(error.message);
		} catch {
			// eslint-disable
		}
	}

	async onFileCreated(file: TFile): Promise<void> {
		// Проверяем, включена ли автозаполнение
		if (!this.settings.autoFillOnCreate) {
			return;
		}

		// Проверяем, что файл markdown
		if (file.extension !== 'md') {
			return;
		}

		// Проверяем, что файл в нужной папке
		const movieFolder = this.settings.movieFolder;
		if (!movieFolder || !file.path.startsWith(movieFolder)) {
			return;
		}

		// Проверяем, что файл пустой или почти пустой (меньше 10 символов)
		const content = await this.app.vault.read(file);
		if (content.trim().length > 10) {
			return; // Файл уже содержит данные
		}

		// Берем имя файла как поисковый запрос
		const searchQuery = file.basename;

		// Небольшая задержка, чтобы файл успел открыться
		setTimeout(async () => {
			try {
				// Открываем файл
				const leaf = this.app.workspace.getLeaf(false);
				await leaf.openFile(file);

				// ПРОВЕРКА: цифры или буквы
				const isNumericId = /^\d+$/.test(searchQuery.trim());

				let selectedActor: MovieShow;

				if (isNumericId) {
					// Если имя файла состоит только из цифр - это ID
					const actorId = parseInt(searchQuery.trim());
					new Notice(`Fetching actor by ID: ${actorId}`);

					try {
						// Получаем данные НАПРЯМУЮ по ID
						selectedActor = await getMovieShowById(
							actorId,
							this.settings.apiToken,
							this.settings.movieFolder
						);
					} catch (error) {
						console.error("Error fetching by ID:", error);
						new Notice(`Failed to fetch actor with ID ${actorId}`);
						return;
					}
				} else {
					// Если имя содержит буквы - обычный поиск
					new Notice(`Searching for: ${searchQuery}`);

					const searchResults = await getByQuery(searchQuery, this.settings.apiToken);

					if (!searchResults?.length) {
						new Notice(`No results found for "${searchQuery}"`);
						return;
					}

					// Открываем suggest modal с результатами
					selectedActor = await this.openSuggestModal(searchResults);
				}

				// ✅ ДОБАВЬТЕ ЭТО: Обработка изображений
				if (this.settings.saveImagesLocally) {
					new Notice("Processing images...");

					const { processImages } = await import("Utils/imageUtils");
					selectedActor = await processImages(
						this.app,
						selectedActor,
						this.settings,
						(current, total, task) => {
							console.log(`Image processing: ${current}/${total} - ${task}`);
						}
					);
				}

				// Получаем контент по шаблону
				const renderedContents = await this.getRenderedContents(selectedActor);

				// ОБНОВЛЯЕМ текущий файл
				await this.app.vault.modify(file, renderedContents);

				// Переключаем в режим чтения
				const activeLeaf = this.app.workspace.getLeaf(false);
				await activeLeaf.openFile(file, { state: { mode: "preview" } });

				new Notice("Actor data added successfully!");

			} catch (err) {
				console.warn('Error auto-filling actor file:', err);
				if (err instanceof Error) {
					this.showNotice(err);
				}
			}
		}, 300);
	}

	async searchByCurrentActorName(): Promise<void> {
		try {
			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!activeView || !activeView.file) {
				new Notice("No active file");
				return;
			}

			const currentFile = activeView.file;

			// Получаем метаданные файла
			const cache = this.app.metadataCache.getFileCache(activeView.file);
			let searchQuery = "";

			// Пытаемся получить имя из frontmatter
			if (cache?.frontmatter?.name) {
				searchQuery = cache.frontmatter.name;
			} else if (cache?.frontmatter?.enName) {
				searchQuery = cache.frontmatter.enName;
			} else {
				// Если в frontmatter нет, берем из названия файла (без .md)
				searchQuery = activeView.file.basename;
			}

			if (!searchQuery) {
				new Notice("Cannot extract actor name from current file");
				return;
			}

			// ПРОВЕРКА: цифры или буквы
			const isNumericId = /^\d+$/.test(searchQuery.trim());

			let selectedActor: MovieShow;

			if (isNumericId) {
				// Если имя файла состоит только из цифр - это ID
				const actorId = parseInt(searchQuery.trim());
				new Notice(`Fetching actor by ID: ${actorId}`);

				try {
					// Получаем данные НАПРЯМУЮ по ID без поиска
					selectedActor = await getMovieShowById(
						actorId,
						this.settings.apiToken,
						this.settings.movieFolder
					);
				} catch (error) {
					console.error("Error fetching by ID:", error);
					new Notice(`Failed to fetch actor with ID ${actorId}`);
					return;
				}
			} else {
				// Если имя содержит буквы - обычный поиск
				new Notice(`Searching for: ${searchQuery}`);

				try {
					const searchResults = await getByQuery(searchQuery, this.settings.apiToken);

					if (!searchResults?.length) {
						new Notice(`No results found for "${searchQuery}"`);
						return;
					}

					// Открываем suggest modal с результатами
					selectedActor = await this.openSuggestModal(searchResults);
				} catch (error) {
					console.error("Error searching:", error);
					new Notice(`Search failed for "${searchQuery}"`);
					return;
				}
			}

			// Получаем контент по шаблону
			const renderedContents = await this.getRenderedContents(selectedActor);

			// ОБНОВЛЯЕМ текущий файл (БЕЗ переименования)
			await this.app.vault.modify(currentFile, renderedContents);

			new Notice("Actor data added successfully!");

		} catch (err) {
			console.error("Error in searchByCurrentActorName:", err);
			this.showNotice(err instanceof Error ? err : new Error("Unknown error"));
		}
	}

	// Main workflow: search -> select -> create note with template
	async createNewNote(): Promise<void> {
		try {
			const movieShow = await this.searchMovieShow();

			const {
				movieFileNameFormat,
				movieFolder,
			} = this.settings;

			const renderedContents = await this.getRenderedContents(movieShow);
			const fileNameFormat = movieFileNameFormat;
			const folderPath = movieFolder;

			// Create folder if it doesn't exist
			if (
				folderPath &&
				!(await this.app.vault.adapter.exists(folderPath))
			) {
				await this.app.vault.createFolder(folderPath);
			}

			const fileName = await makeFileName(
				this.app,
				movieShow,
				fileNameFormat,
				folderPath
			);
			const filePath = `${folderPath}/${fileName}`;
			const targetFile = await this.app.vault.create(
				filePath,
				renderedContents
			);
			const newLeaf = this.app.workspace.getLeaf(true);
			if (!newLeaf) {
				console.warn("No new leaf");
				return;
			}
			await newLeaf.openFile(targetFile, { state: { mode: "preview" } });
			newLeaf.setEphemeralState({ rename: "all" });

			// Jump cursor to next template location
			await new CursorJumper(this.app).jumpToNextCursorLocation();
		} catch (err) {
			console.warn(err);
			this.showNotice(err);
		}
	}

	// Coordinates search process: search then select from results
	async searchMovieShow(): Promise<MovieShow> {
		const searchedItems = await this.openSearchModal();
		return await this.openSuggestModal(searchedItems);
	}

	// Opens search modal and returns found items
	async openSearchModal(): Promise<KinopoiskSuggestItem[]> {
		return new Promise((resolve, reject) => {
			return new SearchModal(this, (error, results) => {
				return error ? reject(error) : resolve(results ?? []);
			}).open();
		});
	}

	// Opens suggestion modal and returns detailed info about selected item
	async openSuggestModal(items: KinopoiskSuggestItem[]): Promise<MovieShow> {
		return new Promise((resolve, reject) => {
			return new ItemsSuggestModal(this, items, (error, selectedItem) => {
				return error ? reject(error) : resolve(selectedItem!);
			}).open();
		});
	}

	// Loads template content and fills it with movie/series data
	async getRenderedContents(movieShow: MovieShow) {
		const { movieTemplateFile } = this.settings;
		const templateFile = movieTemplateFile;
		if (templateFile) {
			const templateContents = await getTemplateContents(
				this.app,
				templateFile
			);
			const replacedVariable = replaceVariableSyntax(
				movieShow,
				templateContents
			);
			return replacedVariable;
		}
		return "";
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
