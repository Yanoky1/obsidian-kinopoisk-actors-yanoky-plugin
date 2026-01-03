import { Notice, Plugin, MarkdownView, TFile, TAbstractFile } from "obsidian";
import { SearchModal } from "Views/search_modal";
import { ItemsSuggestModal } from "Views/suggest_modal";
import { KinopoiskSuggestItem } from "Models/kinopoisk_response";
import { MoviewShow } from "Models/MovieShow.model";
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
import { getByQuery } from "APIProvider/provider";

export default class ObsidianKinopoiskPlugin extends Plugin {
	settings: ObsidianKinopoiskPluginSettings;

	async onload() {
		await this.loadSettings();

		this.addRibbonIcon("circle-user-round", "Search in Kinopoisk actors", () => {
			this.createNewNote();
		});

		this.addCommand({
			id: "open-search-kinopoisk-actor-modal",
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

		this.addCommand({
			id: "fill-current-actor-file",
			name: "Fill current file with actor data",
			checkCallback: (checking: boolean) => {
				const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (activeView?.file) {
					if (!checking) {
						this.fillCurrentActorFile();
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
		const actorName = file.basename;

		// Небольшая задержка, чтобы файл успел открыться
		setTimeout(async () => {
			try {
				// Открываем файл
				const leaf = this.app.workspace.getLeaf(false);
				await leaf.openFile(file);

				// Выполняем поиск по имени файла
				new Notice(`Searching for: ${actorName}`);

				const searchResults = await getByQuery(actorName, this.settings.apiToken);

				if (!searchResults?.length) {
					new Notice(`No results found for "${actorName}"`);
					return;
				}

				// Открываем suggest modal с результатами
				const selectedActor = await this.openSuggestModal(searchResults);

				// Получаем контент по шаблону
				const renderedContents = await this.getRenderedContents(selectedActor);

				// ОБНОВЛЯЕМ текущий файл
				await this.app.vault.modify(file, renderedContents);

				// Опционально: переименовываем файл по формату
				const { movieFileNameFormat } = this.settings;
				const newFileName = makeFileName(selectedActor, movieFileNameFormat);
				const newFilePath = `${movieFolder}/${newFileName}`;

				// Переименовываем только если путь отличается
				if (file.path !== newFilePath) {
					await this.app.fileManager.renameFile(file, newFilePath);
				}

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

	async fillCurrentActorFile(): Promise<void> {
		try {
			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!activeView || !activeView.file) {
				new Notice("No active file");
				return;
			}

			const currentFile = activeView.file;

			// Открываем модальное окно поиска
			const movieShow = await this.searchMovieShow();

			// Получаем контент по шаблону
			const renderedContents = await this.getRenderedContents(movieShow);

			// ОБНОВЛЯЕМ текущий файл вместо создания нового
			await this.app.vault.modify(currentFile, renderedContents);

			// Опционально: переименовываем файл по формату
			const { movieFileNameFormat, movieFolder } = this.settings;
			const newFileName = makeFileName(movieShow, movieFileNameFormat);
			const newFilePath = `${movieFolder}/${newFileName}`;

			// Переименовываем только если путь отличается
			if (currentFile.path !== newFilePath) {
				await this.app.fileManager.renameFile(currentFile, newFilePath);
			}

			new Notice("Actor data added successfully!");

		} catch (err) {
			console.warn(err);
			this.showNotice(err);
		}
	}

	showNotice(error: Error) {
		try {
			new Notice(error.message);
		} catch {
			// eslint-disable
		}
	}

	async searchByCurrentActorName(): Promise<void> {
		try {
			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!activeView || !activeView.file) {
				new Notice("No active file");
				return;
			}

			// Получаем метаданные файла
			const cache = this.app.metadataCache.getFileCache(activeView.file);
			let actorName = "";

			// Пытаемся получить имя из frontmatter
			if (cache?.frontmatter?.name) {
				actorName = cache.frontmatter.name;
			} else if (cache?.frontmatter?.enName) {
				actorName = cache.frontmatter.enName;
			} else {
				// Если в frontmatter нет, берем из названия файла (без .md)
				actorName = activeView.file.basename;
			}

			if (!actorName) {
				new Notice("Cannot extract actor name from current file");
				return;
			}

			new Notice(`Searching for: ${actorName}`);

			// Выполняем поиск
			const searchResults = await getByQuery(actorName, this.settings.apiToken);

			if (!searchResults?.length) {
				new Notice(`No results found for "${actorName}"`);
				return;
			}

			// Открываем suggest modal с результатами
			const selectedActor = await this.openSuggestModal(searchResults);

			// Создаем заметку для выбранного актера
			const {
				movieFileNameFormat,
				movieFolder,
			} = this.settings;

			const renderedContents = await this.getRenderedContents(selectedActor);
			const fileName = makeFileName(selectedActor, movieFileNameFormat);
			const filePath = `${movieFolder}/${fileName}`;
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

		} catch (err) {
			console.warn(err);
			this.showNotice(err);
		}
	}

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
			const fileName = makeFileName(movieShow, fileNameFormat);
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
		} catch (err) {
			console.warn(err);
			this.showNotice(err);
		}
	}

	async searchMovieShow(): Promise<MoviewShow> {
		const searchedItems = await this.openSearchModal();
		return await this.openSuggestModal(searchedItems);
	}

	async openSearchModal(): Promise<KinopoiskSuggestItem[]> {
		return new Promise((resolve, reject) => {
			return new SearchModal(this, (error, results) => {
				return error ? reject(error) : resolve(results ?? []);
			}).open();
		});
	}

	async openSuggestModal(items: KinopoiskSuggestItem[]): Promise<MoviewShow> {
		return new Promise((resolve, reject) => {
			return new ItemsSuggestModal(
				this,
				items,
				this.settings.movieFolder,
				(error, selectedItem) => {
					return error ? reject(error) : resolve(selectedItem!);
				}
			).open();
		});
	}

	async getRenderedContents(movieShow: MoviewShow) {
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