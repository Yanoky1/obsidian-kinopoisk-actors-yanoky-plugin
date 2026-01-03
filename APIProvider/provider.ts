import { requestUrl } from "obsidian";
import {
	KinopoiskSuggestItem,
	KinopoiskSuggestItemsResponse,
	KinopoiskFullInfo,
} from "Models/kinopoisk_response";
import { MoviewShow } from "Models/MovieShow.model";
import { capitalizeFirstLetter } from "Utils/utils";

export async function apiGet<T>(
	url: string,
	token: string,
	params: Record<string, string | number> = {},
	headers?: Record<string, string>
): Promise<T> {
	const apiURL = new URL(url);
	Object.entries(params).forEach(([key, value]) => {
		apiURL.searchParams.append(key, value?.toString());
	});
	if (token === "") {
		throw new Error("You need enter API Token");
	}
	const res = await requestUrl({
		url: apiURL.href,
		method: "GET",
		headers: {
			Accept: "*/*",
			"X-API-KEY": token,
			...headers,
		},
	});
	return res.json as T;
}


function fixPhotoUrl(url: string | null | undefined): string {
	if (!url) return "";
	// Убираем дублированный протокол https:https:// -> https://
	return url.replace(/^https:https:\/\//, "https://");
}


export async function getByQuery(
	query: string,
	token: string
): Promise<KinopoiskSuggestItem[]> {
	try {
		const params = {
			query: query,
			limit: 30,
		};
		const searchResults = await apiGet<KinopoiskSuggestItemsResponse>(
			"https://api.kinopoisk.dev/v1.4/person/search",
			token,
			params
		);
		// Исправляем URL фотографий в результатах поиска
		return searchResults.docs.map(doc => ({
			...doc,
			photo: fixPhotoUrl(doc.photo)
		}));
	} catch (error) {
		console.warn(error);
		throw error;
	}
}

export async function getMovieShowById(
	id: number,
	token: string,
	movieFolder: string
): Promise<MoviewShow> {
	try {
		const searchResul = await apiGet<KinopoiskFullInfo>(
			`https://api.kinopoisk.dev/v1.4/person/${id}`,
			token
		);
		return createMovieShowFrom(searchResul, movieFolder, token);
	} catch (error) {
		console.warn(error);
		throw error;
	}
}
9
export async function createMovieShowFrom(
	fullInfo: KinopoiskFullInfo,
	movieFolder: string,
	token: string
): Promise<MoviewShow> {
	const path = movieFolder ? `${movieFolder.replace(/\/$/, "")}/` : "";

	// Обрабатываем супругов
	let spousesLinks = "";
	if (fullInfo.spouses && Array.isArray(fullInfo.spouses)) {
		const spouseNames: string[] = [];

		for (const spouse of fullInfo.spouses) {
			if (!spouse) continue;

			// Если имя уже есть - используем его
			if (spouse.name) {
				spouseNames.push(`[[${path}${spouse.name}]]`);
			}
			// Если имени нет, но есть id - запрашиваем данные
			else if (spouse.id) {
				try {
					const spouseData = await apiGet<KinopoiskFullInfo>(
						`https://api.kinopoisk.dev/v1.4/person/${spouse.id}`,
						token
					);
					if (spouseData.name) {
						spouseNames.push(`[[${path}${spouseData.name}|${spouseData.name}]]`);
					}
				} catch (error) {
					console.warn(`Failed to fetch spouse data for id ${spouse.id}:`, error);
					// Пропускаем этого супруга при ошибке
				}
			}
		}

		spousesLinks = spouseNames.join(", ");
	}

	return {
		id: fullInfo.id,
		name: fullInfo.name,
		enName: fullInfo.enName,
		spouses: spousesLinks,
		photo: fixPhotoUrl(fullInfo.photo) ?? "",
		kinopoiskUrl: `https://www.kinopoisk.ru/name/${fullInfo.id}/`,
		sex: fullInfo.sex ?? "",
		birthday: fullInfo.birthday?.split('T')[0] || "",
		death: fullInfo.death?.split('T')[0] || "",
		age: fullInfo.age?.toString() ?? "",
		growth: fullInfo.growth?.toString() ?? "",
	};

}
