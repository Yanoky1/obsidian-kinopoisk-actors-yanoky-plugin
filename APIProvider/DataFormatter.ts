/**
 * DataFormatter.ts
 *
 * Formats Kinopoisk API data for use in Obsidian templates
 */

import { KinopoiskFullInfo, KinopoiskSpouses } from "Models/kinopoisk_response";
import { MovieShow } from "Models/MovieShow.model";
import { capitalizeFirstLetter } from "Utils/utils";
import { ObsidianKinopoiskPluginSettings } from "Settings/settings";

const MAX_ARRAY_ITEMS = 50;
const MAX_FACTS_COUNT = 5;

// Content type translations to Russian
const TYPE_TRANSLATIONS: Record<string, string> = {
	"animated-series": "Анимационный сериал",
	anime: "Аниме",
	cartoon: "Мультфильм",
	movie: "Фильм",
	"tv-series": "Сериал",
} as const;

// HTML entities for decoding
const HTML_ENTITIES: Record<string, string> = {
	"&laquo;": "«",
	"&raquo;": "»",
	"&ldquo;": '"',
	"&rdquo;": '"',
	"&lsquo;": "'",
	"&rsquo;": "'",
	"&quot;": '"',
	"&amp;": "&",
	"&lt;": "<",
	"&gt;": ">",
	"&nbsp;": " ",
	"&ndash;": "–",
	"&mdash;": "—",
	"&hellip;": "…",
} as const;

enum FormatType {
	SHORT_VALUE = "short", // Short values without quotes (genres, actors)
	LONG_TEXT = "long", // Long texts with quotes (descriptions)
	URL = "url", // URLs without quotes
	LINK = "link", // [[name]]
	LINK_WITH_PATH = "link_with_path", // [[path/name]]
	LINK_ID_WITH_PATH = "link_id_with_path", // [[path/ID|name]]
}

export class DataFormatter {
	private settings?: {
		movieFolder: string;
	};


	private fetchSpouseDataFn?: (id: number) => Promise<KinopoiskFullInfo>;

	/**
	 * Set settings for path support
	 */
	public setSettings(settings: {
		movieFolder: string;
	}): void {
		this.settings = settings;
	}

	public setFetchSpouseDataFunction(fn: (id: number) => Promise<KinopoiskFullInfo>): void {
		this.fetchSpouseDataFn = fn;
	}


	private async processSpouses(
		spouses: KinopoiskSpouses[] | undefined,
		movieFolder: string
	): Promise<string[]> {
		if (!spouses || !Array.isArray(spouses) || spouses.length === 0) {
			return [];
		}

		const spouseLinks: string[] = [];

		for (const spouse of spouses) {
			if (!spouse) continue;

			// Если есть имя - используем его
			if (spouse.name && spouse.name.trim() !== "") {
				const cleanName = this.cleanTextForMetadata(spouse.name);
				if (spouse.id && movieFolder && movieFolder.trim() !== "") {
					// Формат: [[movieFolder/ID|Name]]
					spouseLinks.push(`"[[${movieFolder}/${spouse.id}|${cleanName}]]"`);
				} else if (spouse.id) {
					// Формат без папки: [[ID|Name]]
					spouseLinks.push(`"[[${spouse.id}|${cleanName}]]"`);
				} else if (movieFolder && movieFolder.trim() !== "") {
					// Только имя с папкой: [[movieFolder/Name]]
					spouseLinks.push(`"[[${movieFolder}/${cleanName}]]"`);
				} else {
					// Только имя без ID и папки: [[Name]]
					spouseLinks.push(`"[[${cleanName}]]"`);
				}
			}
			// Если имени нет, но есть id - пытаемся получить данные
			else if (spouse.id && this.fetchSpouseDataFn) {
				try {
					const spouseData = await this.fetchSpouseDataFn(spouse.id);
					if (spouseData.name && spouseData.name.trim() !== "") {
						const cleanName = this.cleanTextForMetadata(spouseData.name);
						if (movieFolder && movieFolder.trim() !== "") {
							spouseLinks.push(`"[[${movieFolder}/${spouse.id}|${cleanName}]]"`);
						} else {
							spouseLinks.push(`"[[${spouse.id}|${cleanName}]]"`);
						}
					}
				} catch (error) {
					console.warn(`Failed to fetch spouse data for id ${spouse.id}:`, error);
					// Пропускаем этого супруга при ошибке
				}
			}
		}

		return spouseLinks;
	}


	/**
	 * Transforms API data into MovieShow format
	 */
	public async createMovieShowFrom(fullInfo: KinopoiskFullInfo): Promise<MovieShow> {

		const spousesLinks = await this.processSpouses(
			fullInfo.spouses,
			this.settings?.movieFolder || ""
		);

		let photoUrl = fullInfo.photo

		// 2. Очищаем от дублей https:https://
		if (photoUrl) {
			photoUrl = photoUrl.replace(/^https:https:\/\//, "https://");
		}

		const item: MovieShow = {
			// Basic information
			id: fullInfo.id,
			sex: fullInfo.sex,
			spouses: spousesLinks,
			birthday: fullInfo.birthday?.split('T')[0] || "",
			death: fullInfo.death?.split('T')[0] || "",
			age: fullInfo.age?.toString() ?? "",
			growth: fullInfo.growth?.toString() ?? "",

			name: this.formatArray([fullInfo.name], FormatType.SHORT_VALUE),

			description: this.formatArray(
				[fullInfo.description || ""],
				FormatType.LONG_TEXT
			),

			nameForFile: this.cleanTextForMetadata(fullInfo.name),
			enNameForFile: this.cleanTextForMetadata(fullInfo.enName || ""),

			// Images
			posterUrl: this.formatArray(
				[photoUrl || ""],
				FormatType.URL
			),

			// Ready-to-use image links for Obsidian
			posterMarkdown: this.createImageLink(fullInfo.photo || ""),


			// Clean image paths for template sizing (filled by processImages())
			posterPath: [],



			// External IDs and links
			kinopoiskUrl: this.formatArray(
				[`https://www.kinopoisk.ru/name/${fullInfo.id}/`],
				FormatType.URL
			),


			// Alternative names
			enName: this.formatArray(
				[fullInfo.enName || ""],
				FormatType.SHORT_VALUE
			),
		};

		return item;
	}

	/**
	 * Universal array formatting based on type
	 */
	private formatArray(
		items: string[] | Array<{ name: string; id?: number }>,
		formatType: FormatType,
		folderPath?: string,
		maxItems: number = MAX_ARRAY_ITEMS
	): string[] {
		// Для ссылок с ID и путем
		if (formatType === FormatType.LINK_ID_WITH_PATH) {
			const personItems = items as Array<{ name: string; id?: number }>;
			return personItems
				.filter((item) => item.name && item.name.trim() !== "")
				.slice(0, maxItems)
				.map((item) => {
					const cleanName = this.cleanTextForMetadata(item.name);
					if (folderPath && folderPath.trim() !== "" && item.id) {
						return `"[[${folderPath}/${item.id}|${cleanName}]]"`;
					} else if (item.id) {
						return `"[[${item.id}|${cleanName}]]"`;
					}
					return `"[[${cleanName}]]"`;
				});
		}

		// Преобразуем объекты в строки для остальных типов
		const stringItems = (items as any[]).map(item =>
			typeof item === 'object' && item.name ? item.name : item
		);

		const filteredItems = stringItems
			.filter((item): item is string => typeof item === 'string' && item.trim() !== "")
			.slice(0, maxItems);

		switch (formatType) {
			case FormatType.SHORT_VALUE:
				return filteredItems.map((item) =>
					this.cleanTextForMetadata(item)
				);

			case FormatType.LONG_TEXT:
				return filteredItems.map((item) => {
					const cleanedItem = item
						.replace(/\n/g, " ")
						.replace(/\s+/g, " ")
						.trim();
					return `"${cleanedItem}"`;
				});

			case FormatType.URL:
				return filteredItems.map((item) => item.trim());

			case FormatType.LINK:
				// [[Имя]]
				return filteredItems.map((item) => {
					const cleanName = this.cleanTextForMetadata(item);
					return `"[[${cleanName}]]"`;
				});

			case FormatType.LINK_WITH_PATH:
				// [[путь/Имя]]
				return filteredItems.map((item) => {
					const cleanName = this.cleanTextForMetadata(item);
					if (folderPath && folderPath.trim() !== "") {
						return `"[[${folderPath}/${cleanName}]]"`;
					}
					return `"[[${cleanName}]]"`;
				});

			default:
				return filteredItems;
		}
	}

	/**
	 * Calculates seasons data from seasons info
	 */
	private calculateSeasonsData(
		seasonsInfo?: Array<{ episodesCount: number }>
	): {
		count: number;
		averageEpisodesPerSeason: number;
	} {
		if (!seasonsInfo || seasonsInfo.length === 0) {
			return { count: 0, averageEpisodesPerSeason: 0 };
		}

		const totalEpisodes = seasonsInfo.reduce(
			(total, season) => total + season.episodesCount,
			0
		);
		const averageEpisodes = Math.ceil(totalEpisodes / seasonsInfo.length);

		return {
			count: seasonsInfo.length,
			averageEpisodesPerSeason: averageEpisodes,
		};
	}


	/**
	 * Processes facts by removing spoilers and HTML tags
	 */
	private processFacts(
		facts: Array<{ spoiler?: boolean; value: string }>
	): string[] {
		return facts
			.filter(
				(fact) =>
					!fact.spoiler && fact.value && fact.value.trim() !== ""
			)
			.slice(0, MAX_FACTS_COUNT)
			.map((fact) => this.stripHtmlTags(fact.value));
	}



	/**
	 * Formats date to Obsidian format (YYYY-MM-DD)
	 */
	private formatDate(dateString?: string): string {
		if (!dateString) return "";

		try {
			const date = new Date(dateString);

			// Stricter date validation
			if (
				isNaN(date.getTime()) ||
				date.getFullYear() < 1800 ||
				date.getFullYear() > 2100
			) {
				return "";
			}

			return date.toISOString().split("T")[0];
		} catch {
			return "";
		}
	}

	/**
	 * Cleans text from characters that might break metadata
	 */
	private cleanTextForMetadata(text: string): string {
		if (!text) return "";
		return text.replace(/:/g, "").trim();
	}

	/**
	 * Creates image link for Obsidian format
	 */
	private createImageLink(imagePath: string): string[] {
		if (!imagePath || imagePath.trim() === "") return [];

		// Local path uses ![[path]] format
		if (!imagePath.startsWith("http")) {
			return [`![[${imagePath}]]`];
		}

		// Web link uses ![](url) format
		return [`![](${imagePath})`];
	}

	private translateType(type: string): string {
		return TYPE_TRANSLATIONS[type] || type;
	}

	/**
	 * Removes HTML tags and decodes HTML entities
	 */
	private stripHtmlTags(text: string): string {
		// Remove HTML tags
		let cleanText = text.replace(/<[^>]*>/g, "");

		// Decode HTML entities
		for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
			cleanText = cleanText.replace(new RegExp(entity, "g"), char);
		}

		// Remove any remaining HTML entities
		cleanText = cleanText.replace(/&#?\w+;/g, "");

		return cleanText.trim();
	}
}
