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

export interface KinopoiskSuggestItemsResponse {
	docs: KinopoiskSuggestItem[];
}

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

export interface KinopoisImageUrl {
	url?: string;
}

export interface KinopoiskSimpleItem {
	name: string;
}

export interface KinopoiskPerson {
	name: string;
	enProfession: string;
}

export interface KinopoiskSeasonInfo {
	number: number;
	episodesCount: number;
}

export interface KinopoiskRatings {
	kp?: number;
	imdb?: number;
}

export interface KinopoiskExternalIds {
	imdb?: string;
	tmdb?: number;
	kpHD?: string;
}
