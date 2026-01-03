import { App, PluginSettingTab, Setting } from "obsidian";
import ObsidianKinopoiskPlugin from "main";
import { FolderSuggest } from "./Suggesters/FolderSuggester";
import { FileSuggest } from "./Suggesters/FileSuggester";

const docUrl = "https://github.com/Alintor/obsidian-kinopoisk-plugin";
const apiSite = "https://kinopoisk.dev/";

export interface ObsidianKinopoiskPluginSettings {
	apiToken: string; // Token for api requests
	movieFileNameFormat: string; // movie file name format
	movieFolder: string; // movie file location
	movieTemplateFile: string; // movie template
	autoFillOnCreate: boolean;


}

export const DEFAULT_SETTINGS: ObsidianKinopoiskPluginSettings = {
	apiToken: "",
	movieFileNameFormat: "{{name}}",
	movieFolder: "",
	movieTemplateFile: "",
	autoFillOnCreate: true,

};

export class ObsidianKinopoiskSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: ObsidianKinopoiskPlugin) {
		super(app, plugin);
	}

	get settings() {
		return this.plugin.settings;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.classList.add("obsidian-kinopoisk-plugin__settings");

		// Api key
		const apiKeyDesc = document.createDocumentFragment();
		apiKeyDesc.createDiv({
			text: "You need to get API token to use this plugin. Choose free plan and follow steps.",
		});
		apiKeyDesc.createEl("a", {
			text: "Get API Token",
			href: `${apiSite}`,
		});
		new Setting(containerEl)
			.setName("API Token")
			.setDesc(apiKeyDesc)
			.addText((text) =>
				text
					.setPlaceholder("Enter your API Token")
					.setValue(this.plugin.settings.apiToken)
					.onChange(async (value) => {
						this.plugin.settings.apiToken = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).setName("Actors").setHeading();
		// Movie file name
		new Setting(containerEl)
			.setName("Actor file name")
			.setDesc("Enter the actor file name format.")
			.addText((text) =>
				text
					.setPlaceholder("Example: {{name}})")
					.setValue(this.plugin.settings.movieFileNameFormat)
					.onChange(async (value) => {
						this.plugin.settings.movieFileNameFormat = value;
						await this.plugin.saveSettings();
					})
			);
		// Movie file location
		new Setting(containerEl)
			.setName("Actor file location")
			.setDesc("New actor notes will be placed here.")
			.addSearch((cb) => {
				try {
					new FolderSuggest(this.app, cb.inputEl, (folder) => {
						this.plugin.settings.movieFolder = folder;
						this.plugin.saveSettings();
					});
				} catch {
					// eslint-disable
				}
				cb.setPlaceholder("Example: folder1/folder2")
					.setValue(this.plugin.settings.movieFolder)
					.onChange((newFolder) => {
						this.plugin.settings.movieFolder = newFolder;
						this.plugin.saveSettings();
					});
			});

		// Movie template file
		const movieTemplateFileDesc = document.createDocumentFragment();
		movieTemplateFileDesc.createDiv({
			text: "Files will be available as templates.",
		});
		movieTemplateFileDesc.createEl("a", {
			text: "Example Template",
			href: `${docUrl}#example-template`,
		});
		new Setting(containerEl)
			.setName("Actor template file")
			.setDesc(movieTemplateFileDesc)
			.addSearch((cb) => {
				try {
					new FileSuggest(this.app, cb.inputEl, (file) => {
						this.plugin.settings.movieTemplateFile = file;
						this.plugin.saveSettings();
					});
				} catch {
					// eslint-disable
				}
				cb.setPlaceholder("Example: templates/template-file")
					.setValue(this.plugin.settings.movieTemplateFile)
					.onChange((newTemplateFile) => {
						this.plugin.settings.movieTemplateFile =
							newTemplateFile;
						this.plugin.saveSettings();
					});
			});

		// После секции "Movies" добавьте:
		new Setting(containerEl)
			.setName("Auto-fill on file creation")
			.setDesc("Automatically open search modal when creating a new file in the movie folder")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoFillOnCreate)
					.onChange(async (value) => {
						this.plugin.settings.autoFillOnCreate = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
