export type Locale = "en" | "ru";

export interface Translations {
	// General
	sync: string;
	syncStarting: string;
	allFilesUpToDate: string;
	syncError: string;
	connectionSuccessful: string;
	connectionFailed: string;

	// Settings
	settingsHeading: string;
	settingsDescription: string;
	addSyncDirectory: string;
	testAllConnections: string;
	pathPlaceholder: string;
	apiUrlPlaceholder: string;
	apiKeyPlaceholder: string;
	publishFieldPlaceholder: string;
	publishFieldDesc: string;
	testConnection: string;
	resetSyncState: string;
	resetSyncStateConfirm: string;
	syncStateReset: string;
	removeDirectory: string;
	error: string;
	successfulConnections: (success: number, fail: number) => string;

	// Sync actions
	pulledFiles: (count: number) => string;
	pushedFiles: (count: number) => string;
	hiddenNotes: (count: number) => string;
	pushed: string;

	// Conflict view
	syncConflict: string;
	conflictProgress: (current: number, total: number) => string;
	localVersion: string;
	serverVersion: string;
	localLines: (count: number) => string;
	serverLines: (count: number) => string;
	linesChanged: (added: number, removed: number, modified: number) => string;
	keepLocal: string;
	useServer: string;
	keepBoth: string;
	skip: string;
	skipAll: (remaining: number) => string;
	noConflicts: string;
	allConflictsResolved: string;

	// Migration modal
	syncSystemUpdate: string;
	migrationFoundFiles: (count: number) => string;
	migrationDescription: string;
	reviewEachConflict: string;
	trustServerForAll: string;

	// Directory selection
	selectSyncDirectory: string;
	syncThisDirectory: string;
	noSyncDirsConfigured: string;
	openSettings: string;

	// Badge tooltips
	pendingChanges: (pull: number, push: number) => string;
	pendingPull: (count: number) => string;
	pendingPush: (count: number) => string;
}

const en: Translations = {
	// General
	sync: "Sync",
	syncStarting: "Starting sync...",
	allFilesUpToDate: "All files are up to date",
	syncError: "Sync error",
	connectionSuccessful: "Connection successful",
	connectionFailed: "Connection failed",

	// Settings
	settingsHeading: "Sync directories",
	settingsDescription: "Configure directories to sync with remote servers.",
	addSyncDirectory: "Add sync directory",
	testAllConnections: "Test all connections",
	pathPlaceholder: "Path to folder (/ for vault root)",
	apiUrlPlaceholder: "API URL",
	apiKeyPlaceholder: "API Key",
	publishFieldPlaceholder: "Publish field (e.g., publish)",
	publishFieldDesc: "Only push files with this frontmatter field set to true",
	testConnection: "Test connection",
	resetSyncState: "Reset sync state",
	resetSyncStateConfirm: "Reset sync state? Next sync will re-download all files from server.",
	syncStateReset: "Sync state reset",
	removeDirectory: "Remove sync directory",
	error: "Error",
	successfulConnections: (success, fail) =>
		fail === 0 ? `All connections successful (${success})` : `${success} successful, ${fail} failed`,

	// Sync actions
	pulledFiles: (count) => `Pulled ${count} files from server`,
	pushedFiles: (count) => `Pushed ${count} files to server`,
	hiddenNotes: (count) => `Hid ${count} notes not found locally`,
	pushed: "Pushed",

	// Conflict view
	syncConflict: "Sync conflict",
	conflictProgress: (current, total) => `${current} / ${total}`,
	localVersion: "Local version",
	serverVersion: "Server version",
	localLines: (count) => `Local: ${count} lines`,
	serverLines: (count) => `Server: ${count} lines`,
	linesChanged: (added, removed, modified) => `+${added} -${removed} ~${modified}`,
	keepLocal: "Keep local",
	useServer: "Use server",
	keepBoth: "Keep both",
	skip: "Skip",
	skipAll: (remaining) => `Skip all (${remaining} remaining)`,
	noConflicts: "No conflicts to resolve",
	allConflictsResolved: "All conflicts resolved!",

	// Migration modal
	syncSystemUpdate: "Sync system update",
	migrationFoundFiles: (count) => `Found ${count} files with differences between local and server.`,
	migrationDescription: "This is a one-time setup after the plugin update.",
	reviewEachConflict: "Review each conflict",
	trustServerForAll: "Trust server for all",

	// Directory selection
	selectSyncDirectory: "Select sync directory",
	syncThisDirectory: "Sync this directory",
	noSyncDirsConfigured: "No sync directories configured. Please add one in settings first.",
	openSettings: "Open Settings",

	// Badge tooltips
	pendingChanges: (pull, push) => `Trip2g Sync (↓${pull} ↑${push})`,
	pendingPull: (count) => `Trip2g Sync (↓${count} from server)`,
	pendingPush: (count) => `Trip2g Sync (↑${count} to push)`,
};

const ru: Translations = {
	// General
	sync: "Синхронизация",
	syncStarting: "Начинаю синхронизацию...",
	allFilesUpToDate: "Все файлы актуальны",
	syncError: "Ошибка синхронизации",
	connectionSuccessful: "Соединение успешно",
	connectionFailed: "Ошибка соединения",

	// Settings
	settingsHeading: "Папки синхронизации",
	settingsDescription: "Настройте папки для синхронизации с удалёнными серверами.",
	addSyncDirectory: "Добавить папку",
	testAllConnections: "Проверить все соединения",
	pathPlaceholder: "Путь к папке (/ для корня)",
	apiUrlPlaceholder: "API URL",
	apiKeyPlaceholder: "API Key",
	publishFieldPlaceholder: "Поле публикации (напр., publish)",
	publishFieldDesc: "Отправлять только файлы с этим полем в frontmatter",
	testConnection: "Проверить соединение",
	resetSyncState: "Сбросить состояние синхронизации",
	resetSyncStateConfirm: "Сбросить состояние? При следующей синхронизации все файлы будут загружены с сервера.",
	syncStateReset: "Состояние синхронизации сброшено",
	removeDirectory: "Удалить папку",
	error: "Ошибка",
	successfulConnections: (success, fail) =>
		fail === 0 ? `Все соединения успешны (${success})` : `${success} успешно, ${fail} с ошибкой`,

	// Sync actions
	pulledFiles: (count) => `Получено ${count} файлов с сервера`,
	pushedFiles: (count) => `Отправлено ${count} файлов на сервер`,
	hiddenNotes: (count) => `Скрыто ${count} заметок, отсутствующих локально`,
	pushed: "Отправлено",

	// Conflict view
	syncConflict: "Конфликт синхронизации",
	conflictProgress: (current, total) => `${current} / ${total}`,
	localVersion: "Локальная версия",
	serverVersion: "Версия на сервере",
	localLines: (count) => `Локально: ${count} строк`,
	serverLines: (count) => `Сервер: ${count} строк`,
	linesChanged: (added, removed, modified) => `+${added} -${removed} ~${modified}`,
	keepLocal: "Оставить локальную",
	useServer: "Взять с сервера",
	keepBoth: "Сохранить обе",
	skip: "Пропустить",
	skipAll: (remaining) => `Пропустить все (${remaining} осталось)`,
	noConflicts: "Нет конфликтов для разрешения",
	allConflictsResolved: "Все конфликты разрешены!",

	// Migration modal
	syncSystemUpdate: "Обновление системы синхронизации",
	migrationFoundFiles: (count) => `Найдено ${count} файлов с различиями между локальной и серверной версиями.`,
	migrationDescription: "Это одноразовая настройка после обновления плагина.",
	reviewEachConflict: "Проверить каждый конфликт",
	trustServerForAll: "Доверять серверу для всех",

	// Directory selection
	selectSyncDirectory: "Выберите папку синхронизации",
	syncThisDirectory: "Синхронизировать эту папку",
	noSyncDirsConfigured: "Папки синхронизации не настроены. Добавьте их в настройках.",
	openSettings: "Открыть настройки",

	// Badge tooltips
	pendingChanges: (pull, push) => `Trip2g Sync (↓${pull} ↑${push})`,
	pendingPull: (count) => `Trip2g Sync (↓${count} с сервера)`,
	pendingPush: (count) => `Trip2g Sync (↑${count} к отправке)`,
};

const translations: Record<Locale, Translations> = { en, ru };

let currentLocale: Locale = "en";

export function setLocale(locale: Locale): void {
	currentLocale = locale;
}

export function getLocale(): Locale {
	return currentLocale;
}

export function detectLocale(): Locale {
	// Try to detect from Obsidian's locale or browser
	const browserLang = navigator.language.toLowerCase();
	if (browserLang.startsWith("ru")) {
		return "ru";
	}
	return "en";
}

export function t(): Translations {
	return translations[currentLocale];
}

export { en, ru };
