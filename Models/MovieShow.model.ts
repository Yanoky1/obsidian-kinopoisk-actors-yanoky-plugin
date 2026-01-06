/**
 * MovieShow.model.ts
 *
 * Movie/series data model for Obsidian templates
 * Defines unified data structure for template substitution
 *
 * Note: Most fields are string arrays for YAML compatibility
 * URLs remain unquoted, numeric fields keep primitive types
 */

export interface MovieShow {
	// Basic information
	id: number;
	name: string[];
	description: string[];

	// Images - URLs without quotes (web links or local paths)
	posterUrl: string[];

	// Obsidian-formatted image links - auto-formatted as ![[path]] or ![](path)
	posterMarkdown: string[];

	// Clean image paths - filename only for template sizing: ![350]({{posterPath}})
	posterPath: string[];

	kinopoiskUrl: string[];

	// Person
	sex: string;
	spouses: string[];
	birthday: string;
	death: string;
	age: string;
	growth: string;

	// Alternative names
	enName: string[];

	// File naming properties - cleaned of special characters, unquoted
	nameForFile: string;
	enNameForFile: string;
}
