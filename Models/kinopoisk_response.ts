/**
 * kinopoisk_response.ts
 *
 * Types and interfaces for Kinopoisk API (kinopoisk.dev)
 * Defines data structures for movie/series search and detailed information
 */

/**
 * Search result item
 */
export interface KinopoiskSuggestItem {
	id: number;
	name: string;
	enName: string;
	photo: string;
	sex: string;
	birthday: string;
	age: string;
	growth: string;
}

/**
 * Search API response
 */
export interface KinopoiskSuggestItemsResponse {
	docs: KinopoiskSuggestItem[];
}

/**
 * Complete movie/series information from Kinopoisk API
 */
export interface KinopoiskFullInfo {
	id: number;
	name: string;
	enName: string;
	photo: string;
	spouses: KinopoiskSpouses[];
	sex: string;
	birthday: string;
	death: string;
	age: string;
	growth: string;
	description: string;
	profession: string;
	enProfession: string;
}

export interface KinopoiskSpouses {
	id?: number;
	name?: string;
	divorced?: boolean;
	divorcedReason?: string;
	sex?: string;
	children?: number;
	relation?: string;
}



