import { SuggestModal } from "obsidian";
import { KinopoiskSuggestItem } from "Models/kinopoisk_response";
import { MoviewShow } from "Models/MovieShow.model";
import { getMovieShowById } from "APIProvider/provider";
import ObsidianKinopoiskPlugin from "main";

export class ItemsSuggestModal extends SuggestModal<KinopoiskSuggestItem> {
	private token = "";
	private movieFolder = "";

	constructor(
		plugin: ObsidianKinopoiskPlugin,
		private readonly suggestion: KinopoiskSuggestItem[],
		movieFolder: string,
		private onChoose: (error: Error | null, result?: MoviewShow) => void
	) {
		super(plugin.app);
		this.token = plugin.settings.apiToken;
		this.movieFolder = movieFolder;
	}

	getSuggestions(query: string): KinopoiskSuggestItem[] {
		const searchQuery = query?.toLowerCase().trim();
		
		if (!searchQuery) {
			// Если запрос пустой, сортируем только по наличию фото
			return this.suggestion
				.filter(item => itemHasImage(item))
				.concat(
					this.suggestion.filter(item => !itemHasImage(item))
				);
		}

		return this.suggestion
			.map(item => {
				// Вычисляем релевантность для каждого элемента
				const relevanceScore = calculateRelevanceScore(item, searchQuery);
				const hasImage = itemHasImage(item) ? 1 : 0;
				
				return {
					item,
					relevanceScore,
					hasImage
				};
			})
			.sort((a, b) => {
				// Сначала сортируем по релевантности (больше = лучше)
				if (b.relevanceScore !== a.relevanceScore) {
					return b.relevanceScore - a.relevanceScore;
				}
				
				// Если релевантность одинаковая, сортируем по наличию фото
				if (b.hasImage !== a.hasImage) {
					return b.hasImage - a.hasImage;
				}
				
				// Дополнительная сортировка по длине названия
				return (a.item.name?.length || 0) - (b.item.name?.length || 0);
			})
			.map(data => data.item);
	}

	// Renders each suggestion item.
	renderSuggestion(item: KinopoiskSuggestItem, el: HTMLElement) {
		const title = item.name;
		const subtitle = `${item.age}, ${item.sex}, ${item.enName}`;

		// Сначала создаем контейнер
		const container = el.createEl("div", {
			attr: { style: "display: flex; align-items: center;" },
		});

		// Добавляем изображение в контейнер
		container.createEl("img", {
			attr: {
				src: item.photo ?? "",
				width: "100",
				style: "object-fit: cover; border-radius: 4px; margin-right: 1em;"
			},
		});

		// Создаем блок с текстом внутри контейнера
		const textInfo = container.createEl("div", {
			attr: { style: "flex: 1;" },
		});

		textInfo.createEl("div", { 
			text: title,
			attr: { style: "font-weight: bold; font-size: 1.1em;" }
		});
		textInfo.createEl("small", { text: subtitle });
	}

	// Perform action on the selected suggestion.
	onChooseSuggestion(item: KinopoiskSuggestItem) {
		this.getItemDetails(item);
	}

	async getItemDetails(item: KinopoiskSuggestItem) {
		try {
			const movieShow = await getMovieShowById(item.id, this.token, this.movieFolder);
			this.onChoose(null, movieShow);
		} catch (error) {
			this.onChoose(error);
		}
	}
}

// Вспомогательные функции

function itemHasImage(item: KinopoiskSuggestItem): boolean {
	// Проверяем наличие фото для разных типов элементов
	if ('photo' in item) {
		return !!item.photo && item.photo !== "";
	}
	return false;
}

function calculateRelevanceScore(item: KinopoiskSuggestItem, query: string): number {
	let score = 0;
	
	// Проверяем точное совпадение в названии (самый высокий приоритет)
	if (item.name?.toLowerCase() === query) {
		score += 100;
	}
	if (item.enName?.toLowerCase() === query) {
		score += 100;
	}
	
	// Проверяем, начинается ли название с запроса
	if (item.name?.toLowerCase().startsWith(query)) {
		score += 50;
	}
	if (item.enName?.toLowerCase().startsWith(query)) {
		score += 50;
	}
	
	// Проверяем, заканчивается ли название запросом
	if (item.name?.toLowerCase().endsWith(query)) {
		score += 30;
	}
	if (item.enName?.toLowerCase().endsWith(query)) {
		score += 30;
	}
	
	// Проверяем наличие подстроки в названии
	const nameContains = item.name?.toLowerCase().includes(query) ? query.length : 0;
	const enNameContains = item.enName?.toLowerCase().includes(query) ? query.length : 0;
	
	// Чем больше часть запроса совпадает, тем выше балл
	score += Math.max(nameContains, enNameContains) * 10;
	
	
	return score;
}