const CHAPTERS_FILE = "./gi-data/generated/quests/chapters_with_quests.json";
const NEW_CHAPTERS_FILE = "./gi-data/generated/quests/chapters_with_quests_new.json";
const MATERIALS_FILE = "./gi-data/generated/materials/materials.json";
const QUEST_SUBORDER_BASE = "./gi-quests/QuestSubOrders";
const QUEST_SUBORDER_CHS_BASE = "./gi-quests-chs/QuestSubOrders";

const tooltip = document.getElementById("tooltip");

const questTypeButtons = document.getElementById("quest-type-buttons");
const listView = document.getElementById("list-view");
const detailView = document.getElementById("detail-view");
const listTitle = document.getElementById("list-title");
const cardList = document.getElementById("card-list");
const cardSearch = document.getElementById("card-search");
const cardSearchHelp = document.getElementById("card-search-help");
const backButton = document.getElementById("back-button");
const chapterInfo = document.getElementById("chapter-info");
const chapterQuestList = document.getElementById("chapter-quest-list");
const questInfo = document.getElementById("quest-info");
const lineCounts = document.getElementById("line-counts");
const dialogueLines = document.getElementById("dialogue-lines");
const settingsButton = document.getElementById("settings-button");
const settingsPanel = document.getElementById("settings-panel");
const nicknameInput = document.getElementById("nickname-input");
const languageSelect = document.getElementById("language-select");
const alwaysShowQuestExtraInfoInput = document.getElementById("always-show-quest-extra-info");

let chaptersData = null;
let newChaptersData = null;
let materialsById = new Map();
let currentType = "New";
let currentAllView = "chapters";
let currentNewQuestFilter = "All";
let currentChapters = [];
let currentQuests = [];
let selectedChapter = null;
let selectedQuest = null;
let travelerNickname = localStorage.getItem("travelerNickname") || "Traveler";
let selectedLanguage = localStorage.getItem("selectedLanguage") || "both";
let alwaysShowQuestExtraInfo = localStorage.getItem("alwaysShowQuestExtraInfo") === "true";
let isShiftHeld = false;
let activeSelectionTooltip = null;
let activeSelectionTooltipEvent = null;
let chapterQuestIdsCache = null;
let currentQuestSubOrders = null;
let currentQuestSubOrdersChs = null;
let isNpcSearchResultMode = false;

function shouldShowQuestExtraInfo() {
	return alwaysShowQuestExtraInfo || isShiftHeld;
}

function updateQuestExtraInfoVisibility() {
	if (activeSelectionTooltip && activeSelectionTooltipEvent) {
		showSelectionCardTooltip(activeSelectionTooltipEvent, activeSelectionTooltip);
	}
}

function getQuestExtraInfoHintHtml({
	rewards = [],
	npcs = [],
	chapterChanges = []
} = {}) {
	if (shouldShowQuestExtraInfo()) {
		return "";
	}

	const parts = [];

	if (rewards.length) {
		parts.push("Rewards");
	}

	if (npcs.length) {
		parts.push("NPCs");
	}

	if (chapterChanges.length) {
		parts.push("Chapter Changes");
	}

	if (!parts.length) {
		return "";
	}

	return `
		<div class="card-tooltip-shift-hint">
			Hold Shift to show ${parts.join(", ")}
		</div>
	`;
}

function getDisplayDialogueText(text, line) {
	let displayText = String(text || "")
		.replaceAll("\\n", "\n")
		.replaceAll("{NICKNAME}", travelerNickname || "Traveler");

	if (Number(line?.speakerId) === -1) {
		displayText = displayText
			.replaceAll("Traveler", travelerNickname || "Traveler")
			.replaceAll("旅行者", travelerNickname || "旅行者");
	}

	return displayText;
}

function cleanText(text, line) {
	return getDisplayDialogueText(text, line)
		.replace(
			/([^\s]*)\{RUBY#\[(.*?)\](.*?)\}([^\s]*)/g,
			(match, before, base, ruby, after) => {
				const combinedText = `${before}${after}`;

				return `<span class="ruby-word"><span class="ruby-word-text">${combinedText}</span><span class="ruby-word-note">${ruby}</span></span>`;
			}
		)
		.replace(
			/\{M#(.*?)\}\{F#(.*?)\}/gs,
			(match, maleText, femaleText) => {
				return `(<span class="gender-text" title="Dialogue for Male Traveler">${maleText}</span>/<span class="gender-text" title="Dialogue for Female Traveler">${femaleText}</span>)`;
			}
		);
}

function getChapterType(chapter) {
	if (chapter.styleType === "CHAPTER_STYLE_TYPE_AQ") {
		return "AQ";
	}

	if (chapter.styleType === "CHAPTER_STYLE_TYPE_WQ") {
		return "WQ";
	}

	if (chapter.styleType === "CHAPTER_STYLE_TYPE_LQ") {
		return "LQ";
	}

	if (chapter.styleType === "CHAPTER_STYLE_TYPE_EQ") {
		return "EQ";
	}

	const questType = chapter.quests?.find(quest => quest.type)?.type;

	return questType || "Other";
}

function escapeHtml(text) {
	return String(text || "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#039;");
}

function getLocalizedValue(item, field, fallback = "") {
	if (selectedLanguage === "chs") {
		return item?.[`${field}_chs`] || item?.[field] || fallback;
	}

	return item?.[field] || fallback;
}

function formatGameTextHtml(text) {
	return escapeHtml(text)
		.replaceAll("\\n", "\n")
		.replace(
			/&lt;color=(#[0-9a-fA-F]{3,8})&gt;/g,
			(match, color) => `<span class="game-color-text" style="color: ${color};">`
		)
		.replace(
			/&lt;\/color&gt;/g,
			"</span>"
		);
}

function getLocalizedHtml(item, field, fallback = "") {
	const enText = item?.[field] || fallback;
	const chsText = item?.[`${field}_chs`] || enText;

	if (selectedLanguage === "chs") {
		return formatGameTextHtml(chsText);
	}

	if (selectedLanguage === "both") {
		return `<span class="localized-line">${formatGameTextHtml(chsText)}</span><span class="localized-line localized-line-en">${formatGameTextHtml(enText)}</span>`;
	}

	return formatGameTextHtml(enText);
}

function getLocalizedPlain(item, field, fallback = "") {
	const enText = item?.[field] || fallback;
	const chsText = item?.[`${field}_chs`] || enText;

	if (selectedLanguage === "chs") {
		return chsText;
	}

	if (selectedLanguage === "both") {
		return `${chsText} ${enText}`;
	}

	return enText;
}

function getChapterDisplaySource(chapter) {
	let latestChapterChange = null;

	for (const chapterChange of chapter.chapterChanges || []) {
		if (!latestChapterChange || Number(chapterChange.id) > Number(latestChapterChange.id)) {
			latestChapterChange = chapterChange;
		}
	}

	if (!latestChapterChange) {
		return chapter;
	}

	return {
		...chapter,
		...latestChapterChange,
		id: chapter.id,
		quests: chapter.quests,
		questIds: chapter.questIds,
		styleType: chapter.styleType,
		chapterChanges: chapter.chapterChanges
	};
}

function getChapterTitleHtml(chapter) {
	const displayChapter = getChapterDisplaySource(chapter);
	const title = getLocalizedHtml(displayChapter, "title", `Chapter ${chapter.id}`);
	const chapterNumber = getLocalizedHtml(displayChapter, "chapterNumber", "");

	if (!getLocalizedPlain(displayChapter, "chapterNumber", "")) {
		return title;
	}

	return `${title}<span class="localized-line localized-line-en">-</span>${chapterNumber}`;
}

function getQuestTitleHtml(quest) {
	return getLocalizedHtml(quest, "title", `Quest ${quest.id}`);
}

function getQuestPreviewHtml(quest) {
	if (quest.description || quest.description_chs) {
		return getLocalizedHtml(quest, "description", "No description");
	}

	if (quest.showType) {
		return escapeHtml(quest.showType);
	}

	return "No description";
}

function getChapterQuestIds() {
	if (chapterQuestIdsCache) {
		return chapterQuestIdsCache;
	}

	chapterQuestIdsCache = new Set();

	for (const chapter of chaptersData.chapters || []) {
		for (const questId of chapter.questIds || []) {
			chapterQuestIdsCache.add(Number(questId));
		}

		for (const quest of chapter.quests || []) {
			chapterQuestIdsCache.add(Number(quest.id));
		}
	}

	return chapterQuestIdsCache;
}

function getAllQuests(data) {
	const quests = new Map();

	for (const chapter of data?.chapters || []) {
		for (const quest of chapter.quests || []) {
			quests.set(Number(quest.id), quest);
		}
	}

	for (const quest of data?.quests || []) {
		quests.set(Number(quest.id), quest);
	}

	return [...quests.values()];
}

function getUrlQuestId() {
	const params = new URLSearchParams(window.location.search);

	return params.get("quest") || params.get("id") || params.get("qid");
}

function getUrlChapterId() {
	const params = new URLSearchParams(window.location.search);

	return params.get("chapter") || params.get("cid");
}

function findChapterById(id) {
	return (chaptersData.chapters || [])
		.find(chapter => String(chapter.id) === String(id));
}

function findNewChapterById(id) {
	return (newChaptersData?.chapters || [])
		.find(chapter => String(chapter.id) === String(id));
}

function findQuestById(id) {
	for (const chapter of chaptersData.chapters || []) {
		const quest = (chapter.quests || [])
			.find(chapterQuest => String(chapterQuest.id) === String(id));

		if (quest) {
			return {
				chapter,
				quest
			};
		}
	}

	const quest = (chaptersData.quests || [])
		.find(otherQuest => String(otherQuest.id) === String(id));

	if (quest) {
		return {
			chapter: null,
			quest
		};
	}

	const newQuest = getAllQuests(newChaptersData)
		.find(otherQuest => String(otherQuest.id) === String(id));

	if (newQuest) {
		return {
			chapter: null,
			quest: newQuest
		};
	}

	return null;
}

function isQuestIdInNewQuests(questId) {
	const questIdNumber = Number(questId);

	for (const chapter of newChaptersData?.chapters || []) {
		for (const chapterQuestId of chapter.questIds || []) {
			if (Number(chapterQuestId) === questIdNumber) {
				return true;
			}
		}

		for (const quest of chapter.quests || []) {
			if (Number(quest.id) === questIdNumber) {
				return true;
			}
		}
	}

	for (const quest of newChaptersData?.quests || []) {
		if (Number(quest.id) === questIdNumber) {
			return true;
		}
	}

	return false;
}

function findNewChapterByQuestId(questId) {
	const questIdNumber = Number(questId);

	for (const chapter of newChaptersData?.chapters || []) {
		const quest = (chapter.quests || [])
			.find(chapterQuest => Number(chapterQuest.id) === questIdNumber);

		if (quest) {
			return {
				chapter,
				quest
			};
		}
	}

	return null;
}

function openUrlParamTarget() {
	const questId = getUrlQuestId();
	const chapterId = getUrlChapterId();

	if (questId) {
		const newQuestMatch = findNewChapterByQuestId(questId);

		if (newQuestMatch) {
			currentType = "New";
			currentNewQuestFilter = getChapterType(newQuestMatch.chapter);
			updateQuestTypeButtonStates();
			openChapter(newQuestMatch.chapter);
			selectedQuest = newQuestMatch.quest;
			renderChapterQuestCards(newQuestMatch.chapter);
			renderQuest(newQuestMatch.quest);
			return;
		}

		const questMatch = findQuestById(questId);

		if (questMatch?.chapter) {
			setType(getChapterType(questMatch.chapter), {
				allowNewCombo: false
			});
			openChapter(questMatch.chapter);
			selectedQuest = questMatch.quest;
			renderChapterQuestCards(questMatch.chapter);
			renderQuest(questMatch.quest);
			return;
		}

		if (questMatch?.quest) {
			if (isQuestIdInNewQuests(questId)) {
				setType("New");
			} else {
				setType("Other", {
					allowNewCombo: false
				});
			}

			openQuest(questMatch.quest, "list");
			return;
		}

		if (isQuestIdInNewQuests(questId)) {
			setType("New");
		} else {
			setType("Other", {
				allowNewCombo: false
			});
		}

		return;
	}

	if (chapterId) {
		const newChapter = findNewChapterById(chapterId);

		if (newChapter) {
			currentType = "New";
			currentNewQuestFilter = getChapterType(newChapter);
			updateQuestTypeButtonStates();
			openChapter(newChapter);
			return;
		}

		const chapter = findChapterById(chapterId);

		if (chapter) {
			setType(getChapterType(chapter), {
				allowNewCombo: false
			});
			openChapter(chapter);
			return;
		}
	}

	setType("New");
}

function createSelectedOption(title, preview) {
	const wrapper = document.createElement("div");
	wrapper.className = "selected-dialogue";

	const titleElement = document.createElement("div");
	titleElement.className = "selected-dialogue-title";
	titleElement.textContent = title;

	const previewElement = document.createElement("span");
	previewElement.className = "selected-dialogue-preview";
	previewElement.textContent = preview;

	wrapper.append(titleElement, previewElement);

	return wrapper;
}

function createOption(title, preview, searchParts, onClick) {
	const button = document.createElement("button");
	button.className = "dialogue-option";
	button.type = "button";

	const titleElement = document.createElement("div");
	titleElement.className = "dialogue-option-title";
	titleElement.textContent = title;

	const previewElement = document.createElement("span");
	previewElement.className = "dialogue-option-preview";
	previewElement.textContent = preview;

	button.dataset.searchText = searchParts.join(" ").toLowerCase();

	button.append(titleElement, previewElement);
	button.addEventListener("click", onClick);

	return button;
}

function normalizeNpcSearchValue(value) {
	return String(value ?? "").trim().toLowerCase();
}

function getNpcSearchFilter(searchText) {
	const match = String(searchText || "").match(/^npc\s+(id|name)\s*:\s*(.*)$/i);

	if (!match) {
		return null;
	}

	return {
		type: match[1].toLowerCase(),
		value: normalizeNpcSearchValue(match[2])
	};
}

function addQuestNpcSearchData(quest, ids, names) {
	for (const lineCount of quest?.lineCounts || []) {
		const id = normalizeNpcSearchValue(lineCount?.id);

		if (id) {
			ids.add(id);
		}

		for (const name of [lineCount?.name, lineCount?.name_chs]) {
			const normalizedName = normalizeNpcSearchValue(name);

			if (normalizedName) {
				names.add(normalizedName);
			}
		}
	}
}

function getNpcSearchDataForItem(item) {
	const ids = new Set();
	const names = new Set();

	if (Array.isArray(item?.quests)) {
		for (const quest of item.quests) {
			addQuestNpcSearchData(quest, ids, names);
		}
	} else {
		addQuestNpcSearchData(item, ids, names);
	}

	return {
		ids: [...ids],
		names: [...names]
	};
}

function getCardNpcSearchValues(card, searchType) {
	const datasetKey = searchType === "id"
		? "npcSearchIds"
		: "npcSearchNames";

	return (card.dataset[datasetKey] || "")
		.split("\n")
		.filter(Boolean);
}

function doesCardMatchNpcSearch(card, npcSearch) {
	return getCardNpcSearchValues(card, npcSearch.type)
		.includes(npcSearch.value);
}

function doesQuestMatchNpcSearch(quest, npcSearch) {
	const ids = new Set();
	const names = new Set();

	addQuestNpcSearchData(quest, ids, names);

	return npcSearch.type === "id"
		? ids.has(npcSearch.value)
		: names.has(npcSearch.value);
}

function getActiveNpcSearchFilter() {
	const npcSearch = getNpcSearchFilter(cardSearch.value);

	if (!npcSearch?.value) {
		return null;
	}

	return npcSearch;
}

function doesLineCountMatchNpcSearch(lineCount, npcSearch) {
	if (npcSearch.type === "id") {
		return normalizeNpcSearchValue(lineCount?.id) === npcSearch.value;
	}

	return [
		lineCount?.name,
		lineCount?.name_chs
	].some(name => normalizeNpcSearchValue(name) === npcSearch.value);
}

function getQuestNpcSearchLineCounts(quest, npcSearch) {
	return (quest?.lineCounts || [])
		.filter(lineCount => doesLineCountMatchNpcSearch(lineCount, npcSearch));
}

function getNpcSearchLineCountsForTooltip(item, npcSearch) {
	const lineCountsByKey = new Map();

	if (Array.isArray(item?.quests)) {
		for (const quest of item.quests) {
			for (const lineCount of getQuestNpcSearchLineCounts(quest, npcSearch)) {
				const key = `${lineCount.id}:${lineCount.name}:${lineCount.name_chs}`;

				if (!lineCountsByKey.has(key)) {
					lineCountsByKey.set(key, {
						id: lineCount.id,
						name: lineCount.name,
						name_chs: lineCount.name_chs,
						lines: 0
					});
				}

				lineCountsByKey.get(key).lines += Number(lineCount.lines || 0);
			}
		}
	} else {
		for (const lineCount of getQuestNpcSearchLineCounts(item, npcSearch)) {
			const key = `${lineCount.id}:${lineCount.name}:${lineCount.name_chs}`;

			if (!lineCountsByKey.has(key)) {
				lineCountsByKey.set(key, {
					id: lineCount.id,
					name: lineCount.name,
					name_chs: lineCount.name_chs,
					lines: 0
				});
			}

			lineCountsByKey.get(key).lines += Number(lineCount.lines || 0);
		}
	}

	return [...lineCountsByKey.values()]
		.sort((a, b) => Number(b.lines) - Number(a.lines));
}

function getNpcSearchTooltipHtml(item) {
	const npcSearch = getActiveNpcSearchFilter();

	if (!npcSearch) {
		return "";
	}

	const lineCounts = getNpcSearchLineCountsForTooltip(item, npcSearch);

	if (!lineCounts.length) {
		return "";
	}

	const lineCountItems = lineCounts.map(lineCount => {
		return `
			<div class="card-tooltip-npc-line-count">
				<div class="card-tooltip-npc-line-count-name">
					${getLocalizedHtml(lineCount, "name", `NPC ${lineCount.id}`)}
				</div>
				<div class="card-tooltip-npc-line-count-meta">
					ID: ${escapeHtml(lineCount.id)} | Lines: ${escapeHtml(lineCount.lines)}
				</div>
			</div>
		`;
	}).join("");

	return `
		<div class="card-tooltip-section">
			<div class="card-tooltip-heading">NPC Search Match</div>
			<div class="card-tooltip-npc-line-counts">${lineCountItems}</div>
		</div>
	`;
}

function getQuestSearchScopeForCurrentType() {
	if (currentType === "New") {
		if (currentNewQuestFilter === "All") {
			return getAllQuests(newChaptersData);
		}

		if (isMainQuestCategoryType(currentNewQuestFilter)) {
			return getAllQuests({
				chapters: (newChaptersData?.chapters || [])
					.filter(chapter => getChapterType(chapter) === currentNewQuestFilter),
				quests: []
			});
		}

		return getStandaloneNewQuests();
	}

	if (currentType === "Other") {
		return currentQuests;
	}

	if (currentType === "All") {
		return getAllQuests(chaptersData);
	}

	return getAllQuests({
		chapters: (chaptersData?.chapters || [])
			.filter(chapter => getChapterType(chapter) === currentType),
		quests: []
	});
}

function renderNpcSearchQuestCards(npcSearch) {
	showListView();
	cardList.innerHTML = "";
	listTitle.textContent = `${getCurrentChapterListTitle()} Matching NPC`;
	isNpcSearchResultMode = true;

	if (currentChapters.length) {
		const matchingChapters = currentChapters
			.filter(chapter => (chapter.quests || [])
				.some(quest => doesQuestMatchNpcSearch(quest, npcSearch)))
			.sort((a, b) => Number(a.id) - Number(b.id));

		for (const chapter of matchingChapters) {
			cardList.appendChild(
				createSelectionCard(
					getChapterTitleHtml(chapter),
					`${chapter.quests?.length || 0} quests`,
					[
						chapter.id,
						chapter.title,
						chapter.title_chs,
						chapter.chapterNumber,
						chapter.chapterNumber_chs,
						chapter.imageTitle,
						chapter.imageTitle_chs,
						chapter.styleType
					],
					() => {
						openChapter(chapter);
					},
					{
						type: "chapter",
						item: chapter
					}
				)
			);
		}

		if (!matchingChapters.length) {
			cardList.textContent = "No chapters found";
		}

		return;
	}

	const matchingQuests = getQuestSearchScopeForCurrentType()
		.filter(quest => doesQuestMatchNpcSearch(quest, npcSearch))
		.sort((a, b) => Number(a.id) - Number(b.id));

	for (const quest of matchingQuests) {
		cardList.appendChild(
			createSelectionCard(
				`${quest.id} - ${getQuestTitleHtml(quest)}`,
				getQuestPreviewHtml(quest),
				[
					quest.id,
					quest.title,
					quest.title_chs,
					quest.description,
					quest.description_chs,
					quest.type
				],
				() => {
					openQuest(quest, "list");
				},
				"",
				{
					type: "quest",
					item: quest
				}
			)
		);
	}

	if (!matchingQuests.length) {
		cardList.textContent = "No quests found";
	}
}

function renderCurrentCardsForSearch() {
	const searchText = cardSearch.value;

	if (currentType === "New") {
		renderNewQuestCards();
	} else if (currentType === "Other") {
		renderQuestCards("Other Quests", currentQuests);
	} else if (currentType === "All" && currentAllView === "quests") {
		renderQuestCards("All Quests", currentQuests);
	} else {
		renderChapterCards();
	}

	cardSearch.value = searchText;
	filterCardList();
}

function updateCardSearchResults() {
	const npcSearch = getNpcSearchFilter(cardSearch.value);

	if (npcSearch?.value) {
		renderNpcSearchQuestCards(npcSearch);
		return;
	}

	if (isNpcSearchResultMode) {
		renderCurrentCardsForSearch();
		return;
	}

	filterCardList();
}

function filterCardList() {
	const npcSearch = getNpcSearchFilter(cardSearch.value);
	const searchText = cardSearch.value.toLowerCase().trim();

	for (const card of cardList.children) {
		if (npcSearch) {
			card.style.display = !npcSearch.value || doesCardMatchNpcSearch(card, npcSearch)
				? ""
				: "none";
			continue;
		}

		const searchTarget = card.dataset.searchText || "";

		card.style.display = searchTarget.includes(searchText)
			? ""
			: "none";
	}
}

function getSelectionCardUrl(tooltipData) {
	if (tooltipData?.type === "chapter") {
		return `${window.location.pathname}?chapter=${encodeURIComponent(tooltipData.item.id)}`;
	}

	if (tooltipData?.type === "quest") {
		return `${window.location.pathname}?quest=${encodeURIComponent(tooltipData.item.id)}`;
	}

	return window.location.href;
}

function createSelectionCard(title, preview, searchParts, onClick, tooltipData = null) {
	const button = document.createElement("a");
	button.className = "selection-card";
	button.href = getSelectionCardUrl(tooltipData);

	const content = document.createElement("div");
	content.className = "selection-card-content";

	const titleElement = document.createElement("div");
	titleElement.className = "selection-card-title";
	titleElement.innerHTML = title;

	const previewElement = document.createElement("div");
	previewElement.className = "selection-card-preview";
	previewElement.innerHTML = preview;

	button.dataset.searchText = searchParts.join(" ").toLowerCase();

	const npcSearchData = getNpcSearchDataForItem(tooltipData?.item);
	button.dataset.npcSearchIds = npcSearchData.ids.join("\n");
	button.dataset.npcSearchNames = npcSearchData.names.join("\n");

	content.append(titleElement, previewElement);
	button.appendChild(content);
	button.addEventListener("click", event => {
		if (
			event.button !== 0
			|| event.ctrlKey
			|| event.metaKey
			|| event.shiftKey
			|| event.altKey
		) {
			return;
		}

		event.preventDefault();
		onClick(event);
	});

	if (tooltipData) {
		button.addEventListener("mouseenter", event => {
			showSelectionCardTooltip(event, tooltipData);
		});

		button.addEventListener("mousemove", event => {
			activeSelectionTooltipEvent = event;
			moveTooltip(event);
		});

		button.addEventListener("mouseleave", () => {
			activeSelectionTooltip = null;
			activeSelectionTooltipEvent = null;
			hideTooltip();
		});
	}

	return button;
}

function getTooltipRewardsHtml(rewards = []) {
	if (!rewards.length || !shouldShowQuestExtraInfo()) {
		return "";
	}

	const rewardItems = rewards.map(reward => {
		const material = materialsById.get(Number(reward.itemId));
		const name = escapeHtml(getLocalizedValue(material, "name", `Item ${reward.itemId}`));

		return `
			<div class="card-tooltip-reward">
				<span>${name}</span>
				<span>×${escapeHtml(reward.itemCount)}</span>
			</div>
		`;
	}).join("");

	return `
		<div class="card-tooltip-section">
			<div class="card-tooltip-heading">Rewards</div>
			<div class="card-tooltip-rewards">${rewardItems}</div>
		</div>
	`;
}

function getTooltipNpcsHtml(npcs = []) {
	if (!npcs.length || !shouldShowQuestExtraInfo()) {
		return "";
	}

	const seen = new Set();
	const npcItems = [];

	for (const npc of npcs) {
		const key = `${npc.id}:${npc.name}:${npc.name_chs}`;

		if (seen.has(key)) {
			continue;
		}

		seen.add(key);

		npcItems.push(`
			<span class="card-tooltip-npc">
				${getLocalizedHtml(npc, "name", `NPC ${npc.id}`)}
			</span>
		`);
	}

	if (!npcItems.length) {
		return "";
	}

	return `
		<div class="card-tooltip-section">
			<div class="card-tooltip-heading">NPCs</div>
			<div class="card-tooltip-npcs">${npcItems.join("")}</div>
		</div>
	`;
}

function getChapterRewards(chapter) {
	const rewards = new Map();

	for (const quest of chapter.quests || []) {
		for (const reward of quest.rewards || []) {
			const itemId = Number(reward.itemId);
			const currentCount = rewards.get(itemId)?.itemCount || 0;

			rewards.set(itemId, {
				itemId,
				itemCount: currentCount + Number(reward.itemCount || 0)
			});
		}
	}

	return [...rewards.values()];
}

function getChapterNpcs(chapter) {
	const npcs = [];
	const seen = new Set();

	for (const quest of chapter.quests || []) {
		for (const npc of quest.npcs || []) {
			const key = `${npc.id}:${npc.name}:${npc.name_chs}`;

			if (seen.has(key)) {
				continue;
			}

			seen.add(key);
			npcs.push(npc);
		}
	}

	return npcs;
}

function getChapterChangesTooltipHtml(chapter) {
	if (!chapter.chapterChanges?.length || !shouldShowQuestExtraInfo()) {
		return "";
	}

	const changes = chapter.chapterChanges.map(chapterChange => {
		return `
			<div class="card-tooltip-change">
				<div class="card-tooltip-change-label">Chapter Change ${escapeHtml(chapterChange.id)}</div>
				<div>${getLocalizedHtml(chapterChange, "title", `Chapter Change ${chapterChange.id}`)}</div>
				${getLocalizedPlain(chapterChange, "chapterNumber", "") ? `<div>${getLocalizedHtml(chapterChange, "chapterNumber", "")}</div>` : ""}
				${getLocalizedPlain(chapterChange, "imageTitle", "") ? `<div>${getLocalizedHtml(chapterChange, "imageTitle", "")}</div>` : ""}
			</div>
		`;
	}).join("");

	return `
		<div class="card-tooltip-section">
			<div class="card-tooltip-heading">Chapter Changes</div>
			${changes}
		</div>
	`;
}

function showSelectionCardTooltip(event, tooltipData) {
	activeSelectionTooltip = tooltipData;
	activeSelectionTooltipEvent = event;

	if (tooltipData.type === "chapter") {
		const chapter = tooltipData.item;
		const displayChapter = getChapterDisplaySource(chapter);
		const chapterRewards = getChapterRewards(chapter);
		const chapterNpcs = getChapterNpcs(chapter);
		const chapterChanges = chapter.chapterChanges || [];

		tooltip.innerHTML = `
			<div class="card-tooltip-title">${getLocalizedHtml(displayChapter, "title", `Chapter ${chapter.id}`)}</div>
			${getLocalizedPlain(displayChapter, "chapterNumber", "") ? `<div class="card-tooltip-subtitle">${getLocalizedHtml(displayChapter, "chapterNumber", "")}</div>` : ""}
			<div class="card-tooltip-id">Chapter ID: ${escapeHtml(chapter.id)}</div>
			${getNpcSearchTooltipHtml(chapter)}
			${getQuestExtraInfoHintHtml({
				rewards: chapterRewards,
				npcs: chapterNpcs,
				chapterChanges
			})}
			${getTooltipRewardsHtml(chapterRewards)}
			${getTooltipNpcsHtml(chapterNpcs)}
			${getChapterChangesTooltipHtml(chapter)}
		`;
	} else {
		const quest = tooltipData.item;
		const questRewards = quest.rewards || [];
		const questNpcs = quest.npcs || [];

		tooltip.innerHTML = `
			<div class="card-tooltip-title">${getLocalizedHtml(quest, "title", `Quest ${quest.id}`)}</div>
			<div class="card-tooltip-id">Quest ID: ${escapeHtml(quest.id)}</div>
			${getLocalizedPlain(quest, "description", "") ? `<div class="card-tooltip-description">${getLocalizedHtml(quest, "description", "")}</div>` : ""}
			${getNpcSearchTooltipHtml(quest)}
			${getQuestExtraInfoHintHtml({
				rewards: questRewards,
				npcs: questNpcs
			})}
			${getTooltipRewardsHtml(quest.rewards || [])}
			${getTooltipNpcsHtml(quest.npcs || [])}
		`;
	}

	tooltip.classList.add("show");
	moveTooltip(event);
}

function showListView() {
	listView.hidden = false;
	detailView.hidden = true;
	backButton.hidden = true;
	questInfo.innerHTML = "";
	lineCounts.innerHTML = "";
	dialogueLines.innerHTML = "";
	chapterInfo.innerHTML = "";
	chapterQuestList.innerHTML = "";
}

function showDetailView() {
	listView.hidden = true;
	detailView.hidden = false;
	backButton.hidden = false;
}

function getQuestTypeButtonText(type, options = {}) {
	if (type === "All") {
		const allView = options.allView || currentAllView;

		return document.querySelector(`.quest-type-button[data-type="All"][data-all-view="${allView}"]`)?.textContent || "All Chapters";
	}

	return document.querySelector(`.quest-type-button[data-type="${type}"]`)?.textContent || `${type} Quests`;
}

function getCurrentChapterListTitle() {
	if (
		currentType === "New"
		&& currentNewQuestFilter !== "All"
	) {
		return `New ${getQuestTypeButtonText(currentNewQuestFilter)}`;
	}

	return getQuestTypeButtonText(currentType);
}

function renderChapterCards() {
	showListView();
	cardList.innerHTML = "";
	isNpcSearchResultMode = false;

	listTitle.textContent = getCurrentChapterListTitle();

	currentChapters.sort((a, b) => Number(a.id) - Number(b.id));

	for (const chapter of currentChapters) {
		cardList.appendChild(
			createSelectionCard(
				getChapterTitleHtml(chapter),
				`${chapter.quests?.length || 0} quests`,
				[
					chapter.id,
					chapter.title,
					chapter.title_chs,
					chapter.chapterNumber,
					chapter.chapterNumber_chs,
					chapter.imageTitle,
					chapter.imageTitle_chs,
					chapter.styleType
				],
				() => {
					openChapter(chapter);
				},
				{
					type: "chapter",
					item: chapter
				}
			)
		);
	}

	if (!currentChapters.length) {
		cardList.textContent = "No chapters found";
	}

	cardSearch.value = "";
	filterCardList();
}

function renderQuestCards(title, quests) {
	showListView();
	cardList.innerHTML = "";
	isNpcSearchResultMode = false;
	listTitle.textContent = title;

	const sortedQuests = [...quests].sort((a, b) => Number(a.id) - Number(b.id));

	for (const quest of sortedQuests) {
		cardList.appendChild(
			createSelectionCard(
				`${quest.id} - ${getQuestTitleHtml(quest)}`,
				getQuestPreviewHtml(quest),
				[
					quest.id,
					quest.title,
					quest.title_chs,
					quest.description,
					quest.description_chs,
					quest.type
				],
				() => {
					openQuest(quest, "list");
				},
				"",
				{
					type: "quest",
					item: quest
				}
			)
		);
	}

	if (!sortedQuests.length) {
		cardList.textContent = "No quests found";
	}

	cardSearch.value = "";
	filterCardList();
}

function renderChapterInfo(chapter) {
	chapterInfo.innerHTML = "";

	const displayChapter = getChapterDisplaySource(chapter);

	const titleWrapper = document.createElement("div");
	titleWrapper.className = "chapter-title-wrapper";


	title.innerHTML = getChapterTitleHtml(chapter);

	titleWrapper.appendChild(title);

	const meta = document.createElement("p");
	meta.textContent = `Chapter ID: ${chapter.id} | ${chapter.quests?.length || 0} quests`;

	chapterInfo.append(titleWrapper, meta);

	if (displayChapter.imageTitle || displayChapter.imageTitle_chs) {
		const imageTitle = document.createElement("p");
		imageTitle.innerHTML = getLocalizedHtml(displayChapter, "imageTitle", "");
		chapterInfo.appendChild(imageTitle);
	}

	if (chapter.chapterChanges?.length) {
		const changes = document.createElement("div");
		changes.className = "chapter-change-list";

		for (const chapterChange of chapter.chapterChanges) {
			const change = document.createElement("div");
			change.className = "chapter-change-item";

			const changeHeading = document.createElement("div");
			changeHeading.className = "chapter-change-heading";
			changeHeading.textContent = "Chapter Change";

			change.appendChild(changeHeading);

			const oldBlock = document.createElement("div");
			oldBlock.className = "chapter-change-state";

			const oldLabel = document.createElement("div");
			oldLabel.className = "chapter-change-label";
			oldLabel.textContent = "Old:";

			const oldContent = document.createElement("div");
			oldContent.className = "chapter-change-content";

			const oldText = document.createElement("div");
			oldText.className = "chapter-change-text";
			oldText.innerHTML = `${getLocalizedHtml(chapter, "title", `Chapter ${chapter.id}`)}${getLocalizedPlain(chapter, "imageTitle", "") ? `<span class="localized-line">${getLocalizedHtml(chapter, "imageTitle", "")}</span>` : ""}`;

			oldContent.appendChild(oldText);
			oldBlock.append(oldLabel, oldContent);

			const newBlock = document.createElement("div");
			newBlock.className = "chapter-change-state";

			const newLabel = document.createElement("div");
			newLabel.className = "chapter-change-label";
			newLabel.textContent = "New:";

			const newContent = document.createElement("div");
			newContent.className = "chapter-change-content";

			const newText = document.createElement("div");
			newText.className = "chapter-change-text";
			newText.innerHTML = `${getLocalizedHtml(chapterChange, "title", `Chapter Change ${chapterChange.id}`)}${getLocalizedPlain(chapterChange, "imageTitle", "") ? `<span class="localized-line">${getLocalizedHtml(chapterChange, "imageTitle", "")}</span>` : ""}`;

			newContent.appendChild(newText);
			newBlock.append(newLabel, newContent);

			change.append(oldBlock, newBlock);
			changes.appendChild(change);
		}

		chapterInfo.appendChild(changes);
	}
}

function renderChapterQuestCards(chapter) {
	chapterQuestList.innerHTML = "";

	const sortedQuests = [...(chapter.quests || [])].sort((a, b) => Number(a.id) - Number(b.id));

	for (const quest of sortedQuests) {
		const card = createSelectionCard(
			`${quest.id} - ${getQuestTitleHtml(quest)}`,
			getQuestPreviewHtml(quest),
			[
				quest.id,
				quest.title,
				quest.title_chs,
				quest.description,
				quest.description_chs,
				quest.type
			],
			() => {
				selectedQuest = quest;
				renderChapterQuestCards(chapter);
				renderQuest(quest);
			},
			"",
			{
				type: "quest",
				item: quest
			}
		);

		card.classList.toggle("active", Number(selectedQuest?.id) === Number(quest.id));
		chapterQuestList.appendChild(card);
	}
}

function openChapter(chapter) {
	selectedChapter = chapter;
	currentQuests = [...(chapter.quests || [])];
	selectedQuest = currentQuests.sort((a, b) => Number(a.id) - Number(b.id))[0] || null;

	showDetailView();
	renderChapterInfo(chapter);
	renderChapterQuestCards(chapter);

	if (selectedQuest) {
		renderQuest(selectedQuest);
	} else {
		questInfo.innerHTML = "";
		lineCounts.innerHTML = "";
		dialogueLines.textContent = "No quests found";
	}
}

function openQuest(quest, fromView) {
	selectedChapter = null;
	selectedQuest = quest;

	showDetailView();
	chapterInfo.innerHTML = "";
	chapterQuestList.innerHTML = "";
	backButton.dataset.backTo = fromView;

	renderQuest(quest);
}

function moveTooltip(event) {
	const padding = 16;
	const offset = 18;

	tooltip.style.left = "0px";
	tooltip.style.top = "0px";

	const tooltipRect = tooltip.getBoundingClientRect();

	let left = event.clientX + offset;
	let top = event.clientY + offset;

	if (left + tooltipRect.width > window.innerWidth - padding) {
		left = window.innerWidth - tooltipRect.width - padding;
	}

	if (top + tooltipRect.height > window.innerHeight - padding) {
		top = window.innerHeight - tooltipRect.height - padding;
	}

	if (top < padding) {
		top = padding;
	}

	if (left < padding) {
		left = padding;
	}

	tooltip.style.left = `${left}px`;
	tooltip.style.top = `${top}px`;
}

function hideTooltip() {
	tooltip.classList.remove("show");
}

function getNpcClipboardText(npc) {
	const lines = [];

	for (const [label, value] of Object.entries({
		name: npc.name,
		name_chs: npc.name_chs,
		id: npc.id,
		uniqueBodyId: npc.uniqueBodyId,
		bodyType: npc.bodyType,
		prefabPathHash: npc.prefabPathHash,
		jsonName: npc.jsonName
	})) {
		if (value === undefined || value === null || value === "") {
			continue;
		}

		lines.push(`${label}: ${value}`);
	}

	return lines.join("\n");
}

function showNpcTooltip(event, npc) {
	const metaRows = [];

	for (const [label, value] of Object.entries({
		ID: npc.id,
		"Unique Body ID": npc.uniqueBodyId,
		"Body Type": npc.bodyType,
		"Prefab Path Hash": npc.prefabPathHash,
		"JSON Name": npc.jsonName
	})) {
		if (value === undefined || value === null || value === "") {
			continue;
		}

		metaRows.push(`
			<div class="tooltip-meta-row">
				<span class="tooltip-meta-label">${escapeHtml(label)}:</span>
				<span class="tooltip-meta-value">${escapeHtml(value)}</span>
			</div>
		`);
	}

	tooltip.innerHTML = `
		<div class="tooltip-title">
			${getLocalizedHtml(npc, "name", `NPC ${npc.id}`)}
		</div>

		<div class="tooltip-meta-list">
			${metaRows.join("")}
		</div>

		<div class="tooltip-copy-hint">
			Click to copy
		</div>
	`;

	tooltip.classList.add("show");

	moveTooltip(event);
}

function renderQuestNpcs(quest) {
	if (!quest.npcs?.length) {
		return;
	}

	const npcsBlock = document.createElement("div");
	npcsBlock.className = "quest-extra-info quest-npcs";

	const npcsTitle = document.createElement("h2");
	npcsTitle.textContent = "NPCs";

	const npcs = document.createElement("div");
	npcs.className = "npc-list";

	for (const npc of quest.npcs) {
		const npcItem = document.createElement("div");
		npcItem.className = "npc-item";

		const npcName = document.createElement("div");
		npcName.className = "npc-name";
		npcName.innerHTML = getLocalizedHtml(npc, "name", `NPC ${npc.id}`);

		npcItem.appendChild(npcName);

		npcItem.addEventListener("mouseenter", event => {
			showNpcTooltip(event, npc);
		});

		npcItem.addEventListener("mousemove", moveTooltip);
		npcItem.addEventListener("mouseleave", hideTooltip);

		npcItem.addEventListener("click", async () => {
			await navigator.clipboard.writeText(getNpcClipboardText(npc));

			tooltip.classList.add("show");
			tooltip.querySelector(".tooltip-copy-hint").textContent = "Copied";
		});

		npcs.appendChild(npcItem);
	}

	npcsBlock.append(npcsTitle, npcs);
	questInfo.appendChild(npcsBlock);
}

function renderQuestInfo(quest) {
	questInfo.innerHTML = "";

	const title = document.createElement("h2");
	title.innerHTML = `${quest.id} - ${getQuestTitleHtml(quest)}`;

	const description = document.createElement("p");
	description.className = "quest-description";
	description.innerHTML = getQuestPreviewHtml(quest);

	const meta = document.createElement("div");
	meta.className = "quest-meta";

	for (const [label, value] of Object.entries({
		Type: quest.type,
		Series: quest.series,
		"Show Type": quest.showType,
	})) {
		if (!value) {
			continue;
		}

		const item = document.createElement("span");
		item.textContent = `${label}: ${value}`;
		meta.appendChild(item);
	}

	questInfo.append(title, description, meta);

	if (quest.rewards?.length) {
		const rewardsBlock = document.createElement("div");
		rewardsBlock.className = "quest-rewards quest-extra-info";

		const rewardsTitle = document.createElement("h2");
		rewardsTitle.className = "quest-rewards-title";
		rewardsTitle.textContent = "Rewards";

		const rewards = document.createElement("div");
		rewards.className = "reward-list";

		for (const reward of quest.rewards) {
			const material = materialsById.get(Number(reward.itemId));
			const name = getLocalizedValue(material, "name", `Item ${reward.itemId}`);

			const rewardItem = document.createElement("div");
			rewardItem.className = "reward-item";
			rewardItem.innerHTML = `<span class="reward-name">${escapeHtml(name)}</span><span class="reward-count">×${escapeHtml(reward.itemCount)}</span>`;
			rewards.appendChild(rewardItem);
		}

		rewardsBlock.append(rewardsTitle, rewards);
		questInfo.appendChild(rewardsBlock);
	}

	renderQuestNpcs(quest);
}

function getNextDialoguePreview(dialog) {
	if (!dialog) {
		return "Missing dialogue";
	}

	const speakerName = Number(dialog.speakerId) === -1
		? travelerNickname || "Traveler"
		: dialog.speakerName || `NPC_${dialog.speakerId}`;

	const text = getDisplayDialogueText(dialog.text, dialog)
		.replaceAll("\n", " ")
		.replace(/\{RUBY#\[(.*?)\](.*?)\}/g, "$2")
		.replace(/\{M#(.*?)\}\{F#(.*?)\}/gs, "$1/$2")
		.trim();

	return `${speakerName}: ${text}`;
}

function getDialogueSpeakerName(line, chsLine = null) {
	if (Number(line?.speakerId) === -1) {
		return travelerNickname || "Traveler";
	}

	if (selectedLanguage === "chs") {
		return chsLine?.speakerName || line?.speakerName || `NPC_${line?.speakerId}`;
	}

	if (selectedLanguage === "both") {
		const chsName = chsLine?.speakerName || line?.speakerName || `NPC_${line?.speakerId}`;
		const enName = line?.speakerName || `NPC_${line?.speakerId}`;

		if (chsName === enName) {
			return chsName;
		}

		return `${chsName} / ${enName}`;
	}

	return line?.speakerName || `NPC_${line?.speakerId}`;
}

function createVoiceFilePathHtml(voiceFilePath) {
	return `<span class="dialogue-line-voice-file-path">${escapeHtml(voiceFilePath)}</span>`;
}

function createGenderedVoiceFilePathHtml(heroVoiceFilePath, heroineVoiceFilePath) {
	return `
		<span class="dialogue-line-voice-file-path">
			(<span class="gender-text" title="Dialogue for Male Traveler">${escapeHtml(heroVoiceFilePath)}</span>/<span class="gender-text" title="Dialogue for Female Traveler">${escapeHtml(heroineVoiceFilePath)}</span>)
		</span>
	`;
}

function createVoiceFileElement(line, chsLine = null) {
	const voiceFile = selectedLanguage === "chs"
		? chsLine?.voiceFile || line.voiceFile
		: line.voiceFile || chsLine?.voiceFile;

	if (!voiceFile) {
		return null;
	}

	const voiceFileElement = document.createElement("div");
	voiceFileElement.className = "dialogue-line-voice-file";

	if (typeof voiceFile === "string") {
		voiceFileElement.innerHTML = `Voice File: ${createVoiceFilePathHtml(voiceFile)}`;
		return voiceFileElement;
	}

	if (typeof voiceFile !== "object" || Array.isArray(voiceFile)) {
		return null;
	}

	if (voiceFile.hero && voiceFile.heroine) {
		voiceFileElement.innerHTML = `Voice File: ${createGenderedVoiceFilePathHtml(voiceFile.hero, voiceFile.heroine)}`;
		return voiceFileElement;
	}

	const voiceFileEntries = Object.entries(voiceFile)
		.filter(([, value]) => value);

	if (!voiceFileEntries.length) {
		return null;
	}

	voiceFileElement.innerHTML = `Voice File: ${voiceFileEntries.map(([key, value]) => `${escapeHtml(key)}: ${createVoiceFilePathHtml(value)}`).join(" | ")}`;

	return voiceFileElement;
}

function renderDialogueLine(line, dialogs, selectedBranches, onBranchChange, chsLine = null, chsDialogs = {}) {
	const lineElement = document.createElement("article");
	lineElement.className = "dialogue-line";

	const speaker = document.createElement("h3");
	speaker.textContent = getDialogueSpeakerName(line, chsLine);

	const text = document.createElement("p");

	if (selectedLanguage === "chs") {
		text.innerHTML = cleanText(chsLine?.text ?? line.text, chsLine || line);
	} else if (selectedLanguage === "both") {
		text.innerHTML = `<span class="dialogue-line-text-chs">${cleanText(chsLine?.text ?? line.text, chsLine || line)}</span><span class="dialogue-line-text-en">${cleanText(line.text, line)}</span>`;
	} else {
		text.innerHTML = cleanText(line.text, line);
	}

	const lineId = document.createElement("div");
	lineId.className = "dialogue-line-id";
	lineId.textContent = `Line ID: ${line.id} | Speaker ID: ${line.speakerId}`;

	const voiceFile = createVoiceFileElement(line, chsLine);

	lineElement.append(speaker, text, lineId);

	if (voiceFile) {
		lineElement.appendChild(voiceFile);
	}

	if ((line.nextDialogs || []).length > 1) {
		const branchWrapper = document.createElement("div");
		branchWrapper.className = "branch-dropdown-wrapper";

		const label = document.createElement("label");
		label.textContent = `Next Dialogue`;

		const branchDropdown = document.createElement("div");
		branchDropdown.className = "dialogue-dropdown";

		const branchButton = document.createElement("button");
		branchButton.className = "dialogue-dropdown-button";
		branchButton.type = "button";

		const branchList = document.createElement("div");
		branchList.className = "dialogue-dropdown-list";

		const selectedNextDialogId = String(selectedBranches[String(line.id)] || line.nextDialogs[0]);
		const selectedNextDialog = dialogs[String(selectedNextDialogId)];
		const selectedNextDialogChs = chsDialogs[String(selectedNextDialogId)];

		branchButton.appendChild(
			createSelectedOption(
				selectedNextDialogId,
				getNextDialoguePreview(selectedLanguage === "chs" ? selectedNextDialogChs || selectedNextDialog : selectedNextDialog)
			)
		);

		for (const nextDialogId of line.nextDialogs || []) {
			const nextDialog = dialogs[String(nextDialogId)];
			const nextDialogChs = chsDialogs[String(nextDialogId)];

			branchList.appendChild(
				createOption(
					String(nextDialogId),
					getNextDialoguePreview(selectedLanguage === "chs" ? nextDialogChs || nextDialog : nextDialog),
					[
						nextDialogId,
						nextDialog?.speakerName,
						nextDialogChs?.speakerName,
						nextDialog?.speakerId,
						nextDialog?.text,
						nextDialogChs?.text
					],
					() => {
						selectedBranches[String(line.id)] = String(nextDialogId);
						onBranchChange();
					}
				)
			);
		}

		branchButton.addEventListener("click", event => {
			event.stopPropagation();
			branchDropdown.classList.toggle("open");
		});

		branchDropdown.append(branchButton, branchList);
		branchWrapper.append(label, branchDropdown);
		lineElement.appendChild(branchWrapper);
	}

	return lineElement;
}

function getDialoguePath(dialogs, startDialogId, selectedBranches = {}) {
	const path = [];
	const visited = new Set();
	let currentDialogId = String(startDialogId);

	while (currentDialogId && dialogs[currentDialogId] && !visited.has(currentDialogId)) {
		const dialog = dialogs[currentDialogId];
		const nextDialogs = dialog.nextDialogs || [];

		path.push(dialog);
		visited.add(currentDialogId);

		if (!nextDialogs.length) {
			break;
		}

		currentDialogId = String(
			nextDialogs.length === 1
				? nextDialogs[0]
				: selectedBranches[currentDialogId] || nextDialogs[0]
		);
	}

	return path;
}

function getLocalizedBlockHtml(item, field, fallback = "") {
	return getLocalizedHtml(item, field, fallback)
		.replaceAll("\\n", "<br>");
}

function getAdventureGlossaryForSubQuest(subQuestId) {
	const adventureGlossary = selectedQuest?.adventureGlossary || {};
	const subQuestEntries = adventureGlossary[String(subQuestId)];

	if (Array.isArray(subQuestEntries)) {
		return subQuestEntries;
	}

	return [];
}

function splitAdventureGlossaryEntries(entries) {
	return {
		avatars: entries.filter(entry => entry.firstMetId !== undefined && entry.firstMetId !== null),
		areas: entries.filter(entry => entry.tabType)
	};
}

function renderSubQuestDialogue(subQuest, selectedBranches = {}, chsSubQuest = null) {
	const subQuestBlock = document.createElement("section");
	subQuestBlock.className = "subquest-block";

	const subQuestTitle = document.createElement("h2");
	subQuestTitle.className = "subquest-title";

	const enSubQuestName = subQuest.subQuestName || "";
	const chsSubQuestName = chsSubQuest?.subQuestName || enSubQuestName;

	if (selectedLanguage === "chs") {
		subQuestTitle.textContent = `${chsSubQuestName} [${subQuest.subId}]`;
	} else if (selectedLanguage === "both") {
		subQuestTitle.innerHTML = `${escapeHtml(chsSubQuestName)} [${subQuest.subId}]<span class="localized-line localized-line-en">${escapeHtml(enSubQuestName)} [${subQuest.subId}]</span>`;
	} else {
		subQuestTitle.textContent = `${enSubQuestName} [${subQuest.subId}]`;
	}

	const subQuestHeader = document.createElement("div");
	subQuestHeader.className = "subquest-header";

	subQuestHeader.appendChild(subQuestTitle);

	subQuestBlock.appendChild(subQuestHeader);

	const dialogs = subQuest.dialogue?.dialogs || {};
	const chsDialogs = chsSubQuest?.dialogue?.dialogs || {};
	const startDialogs = subQuest.dialogue?.startDialogs || [];

	startDialogs.forEach((startDialogId, index) => {
		if (index > 0) {
			const dialogueGap = document.createElement("div");
			dialogueGap.className = "dialogue-start-gap";

			subQuestBlock.appendChild(dialogueGap);
		}

		const dialoguePath = getDialoguePath(dialogs, startDialogId, selectedBranches);

		for (const line of dialoguePath) {
			subQuestBlock.appendChild(
				renderDialogueLine(
					line,
					dialogs,
					selectedBranches,
					() => {
						renderQuestDialogue(currentQuestSubOrders, currentQuestSubOrdersChs);
					},
					chsDialogs[String(line.id)],
					chsDialogs
				)
			);
		}
	});

	return subQuestBlock;
}

function renderLineCounts(questSubOrders, questSubOrdersChs = null) {
	lineCounts.innerHTML = "";

	const counts = selectedLanguage === "chs"
		? questSubOrdersChs?.lineCounts || questSubOrders.lineCounts || {}
		: questSubOrders.lineCounts || {};

	const chsCounts = questSubOrdersChs?.lineCounts || {};
	const entries = Object.entries(counts);

	if (!entries.length) {
		return;
	}

	const title = document.createElement("h2");
	title.textContent = "Line Counts";

	const list = document.createElement("div");
	list.className = "line-count-list";

	for (const [name, count] of entries) {
		const item = document.createElement("div");
		item.className = "line-count-item";

		const nameElement = document.createElement("span");
		nameElement.className = "line-count-name";
		if (selectedLanguage === "both") {
			const lineCountIdMatch = name.match(/\(([^()]*)\)$/);
			const lineCountId = lineCountIdMatch ? lineCountIdMatch[1] : "";
			const chsName = Object.keys(chsCounts).find(chsEntryName => {
				const chsLineCountIdMatch = chsEntryName.match(/\(([^()]*)\)$/);
				const chsLineCountId = chsLineCountIdMatch ? chsLineCountIdMatch[1] : "";

				return chsLineCountId && chsLineCountId === lineCountId;
			});

			nameElement.innerHTML = `${escapeHtml(chsName || name)}<span class="localized-line localized-line-en">${escapeHtml(name)}</span>`;
		} else {
			nameElement.textContent = name;
		}

		const countElement = document.createElement("span");
		countElement.className = "line-count-number";
		countElement.textContent = count;

		item.append(nameElement, countElement);
		list.appendChild(item);
	}

	lineCounts.append(title, list);
}

function renderQuestDialogue(questSubOrders, questSubOrdersChs = null) {
	currentQuestSubOrders = questSubOrders;
	currentQuestSubOrdersChs = questSubOrdersChs;
	dialogueLines.innerHTML = "";

	if (!questSubOrders.subQuests?.length) {
		dialogueLines.textContent = "No dialogue found";
		return;
	}

	if (!window.questSelectedBranches) {
		window.questSelectedBranches = {};
	}

	for (const subQuest of questSubOrders.subQuests) {
		if (!window.questSelectedBranches[subQuest.subId]) {
			window.questSelectedBranches[subQuest.subId] = {};
		}

		const chsSubQuest = questSubOrdersChs?.subQuests?.find(otherSubQuest => Number(otherSubQuest.subId) === Number(subQuest.subId));

		dialogueLines.appendChild(
			renderSubQuestDialogue(
				subQuest,
				window.questSelectedBranches[subQuest.subId],
				chsSubQuest
			)
		);
	}
}

async function renderQuest(quest) {
	renderQuestInfo(quest);
	window.questSelectedBranches = {};

	dialogueLines.textContent = "Loading dialogue...";

	try {
		const [response, chsResponse] = await Promise.all([
			fetch(`${QUEST_SUBORDER_BASE}/${quest.id}.json`),
			fetch(`${QUEST_SUBORDER_CHS_BASE}/${quest.id}.json`)
		]);

		if (!response.ok) {
			throw new Error(`No dialogue JSON found for quest ${quest.id}`);
		}

		currentQuestSubOrders = await response.json();
		currentQuestSubOrdersChs = chsResponse.ok ? await chsResponse.json() : null;

		renderLineCounts(currentQuestSubOrders, currentQuestSubOrdersChs);
		renderQuestDialogue(currentQuestSubOrders, currentQuestSubOrdersChs);
	} catch (error) {
		lineCounts.innerHTML = "";
		dialogueLines.textContent = error.message;
	}
}

function isMainQuestCategoryType(type) {
	return ["AQ", "LQ", "WQ", "EQ"].includes(type);
}
function getStandaloneNewQuests() {
	const chapterQuestIds = new Set();

	for (const chapter of newChaptersData?.chapters || []) {
		for (const questId of chapter.questIds || []) {
			chapterQuestIds.add(Number(questId));
		}

		for (const quest of chapter.quests || []) {
			chapterQuestIds.add(Number(quest.id));
		}
	}

	return getAllQuests(newChaptersData)
		.filter(quest => !chapterQuestIds.has(Number(quest.id)));
}

function renderNewQuestCards() {
	const allNewQuests = getAllQuests(newChaptersData);

	if (currentNewQuestFilter === "All") {
		currentChapters = [];
		currentQuests = allNewQuests;

		renderQuestCards("New Quests", currentQuests);
		return;
	}

	if (isMainQuestCategoryType(currentNewQuestFilter)) {
		currentQuests = [];
		currentChapters = (newChaptersData.chapters || [])
			.filter(chapter => getChapterType(chapter) === currentNewQuestFilter);

		renderChapterCards();
		return;
	}

	currentChapters = [];
	currentQuests = getStandaloneNewQuests();

	renderQuestCards("New Other Quests", currentQuests);
}

function updateQuestTypeButtonStates() {
	for (const button of questTypeButtons.querySelectorAll(".quest-type-button")) {
		const buttonType = button.dataset.type;
		const buttonAllView = button.dataset.allView || "";

		button.classList.toggle(
			"active",
			(
				buttonType === currentType
				&& (
					buttonType !== "All"
					|| buttonAllView === currentAllView
				)
			)
				|| (
					currentType === "New"
					&& currentNewQuestFilter !== "All"
					&& buttonType === currentNewQuestFilter
				)
		);
	}
}

function setType(type, options = {}) {
	const allowNewCombo = options.allowNewCombo !== false;
	const allView = options.allView || "chapters";

	if (type === "All") {
		currentAllView = allView;
	} else {
		currentAllView = "chapters";
	}

	if (
		allowNewCombo
		&& currentType === "New"
		&& ["AQ", "LQ", "WQ", "EQ", "Other"].includes(type)
	) {
		if (currentNewQuestFilter === type) {
			currentNewQuestFilter = "All";
			currentType = type;
			updateQuestTypeButtonStates();
			setType(type, {
				allowNewCombo: false
			});
			return;
		}

		currentNewQuestFilter = type;
		updateQuestTypeButtonStates();
		renderNewQuestCards();
		return;
	}

	const previousType = currentType;

	currentType = type;

	if (type === "New") {
		if (["AQ", "LQ", "WQ", "EQ", "Other"].includes(previousType)) {
			currentNewQuestFilter = previousType;
		} else {
			currentNewQuestFilter = "All";
		}

		updateQuestTypeButtonStates();
		renderNewQuestCards();
		return;
	}

	currentNewQuestFilter = "All";
	updateQuestTypeButtonStates();

	if (type === "Other") {
		const chapterQuestIds = getChapterQuestIds();

		currentChapters = [];
		currentQuests = (chaptersData.quests || [])
			.filter(quest => !chapterQuestIds.has(Number(quest.id)));

		renderQuestCards("Other Quests", currentQuests);
		return;
	}

	if (type === "All") {
		if (currentAllView === "quests") {
			currentChapters = [];
			currentQuests = getAllQuests(chaptersData);

			renderQuestCards("All Quests", currentQuests);
			return;
		}

		currentQuests = [];
		currentChapters = [...(chaptersData.chapters || [])];
	} else {
		currentQuests = [];
		currentChapters = (chaptersData.chapters || [])
			.filter(chapter => getChapterType(chapter) === type);
	}

	renderChapterCards();
}

function loadMaterials(materials) {
	const materialList = Array.isArray(materials)
		? materials
		: Object.values(materials || {});

	for (const material of materialList) {
		if (!material?.id) {
			continue;
		}

		materialsById.set(Number(material.id), material);
	}
}

async function loadPage() {
	const [chaptersResponse, newChaptersResponse, materialsResponse] = await Promise.all([
		fetch(CHAPTERS_FILE),
		fetch(NEW_CHAPTERS_FILE),
		fetch(MATERIALS_FILE)
	]);

	if (!chaptersResponse.ok) {
		throw new Error(`Failed to load ${CHAPTERS_FILE}`);
	}

	chaptersData = await chaptersResponse.json();

	if (newChaptersResponse.ok) {
		newChaptersData = await newChaptersResponse.json();
	} else {
		newChaptersData = {
			chapters: [],
			quests: []
		};
	}

	if (materialsResponse.ok) {
		loadMaterials(await materialsResponse.json());
	}

	openUrlParamTarget();
}

backButton.addEventListener("click", () => {
	selectedQuest = null;
	selectedChapter = null;

	currentQuestSubOrders = null;
	currentQuestSubOrdersChs = null;

	if (currentType === "New") {
		renderNewQuestCards();
		return;
	}

	if (currentType === "Other") {
		renderQuestCards("Other Quests", currentQuests);
		return;
	}

	if (currentType === "All" && currentAllView === "quests") {
		renderQuestCards("All Quests", currentQuests);
		return;
	}

	renderChapterCards();
});

questTypeButtons.addEventListener("click", event => {
	const button = event.target.closest(".quest-type-button");

	if (!button) {
		return;
	}

	setType(button.dataset.type, {
		allView: button.dataset.allView || "chapters"
	});
});

document.addEventListener("click", event => {
	for (const dropdown of document.querySelectorAll(".dialogue-dropdown.open")) {
		if (!dropdown.contains(event.target)) {
			dropdown.classList.remove("open");
		}
	}

	if (
		!settingsPanel.contains(event.target)
		&& !settingsButton.contains(event.target)
	) {
		settingsPanel.classList.remove("open");
	}
});

cardSearch.addEventListener("input", () => {
	updateCardSearchResults();
});

cardSearch.addEventListener("focus", () => {
	cardSearchHelp.hidden = false;
});

cardSearch.addEventListener("blur", () => {
	cardSearchHelp.hidden = true;
});

nicknameInput.value = travelerNickname;
languageSelect.value = selectedLanguage;
alwaysShowQuestExtraInfoInput.checked = alwaysShowQuestExtraInfo;
updateQuestExtraInfoVisibility();

settingsButton.addEventListener("click", () => {
	settingsPanel.classList.toggle("open");
});

nicknameInput.addEventListener("input", () => {
	travelerNickname = nicknameInput.value.trim() || "Traveler";

	localStorage.setItem("travelerNickname", travelerNickname);

	if (currentQuestSubOrders) {
		renderQuestDialogue(currentQuestSubOrders, currentQuestSubOrdersChs);
	}
});

languageSelect.addEventListener("change", () => {
	selectedLanguage = languageSelect.value;

	localStorage.setItem("selectedLanguage", selectedLanguage);

	if (!detailView.hidden) {
		if (selectedChapter) {
			renderChapterInfo(selectedChapter);
			renderChapterQuestCards(selectedChapter);
		}

		if (selectedQuest) {
			renderQuestInfo(selectedQuest);
		}

		if (currentQuestSubOrders) {
			renderLineCounts(currentQuestSubOrders, currentQuestSubOrdersChs);
			renderQuestDialogue(currentQuestSubOrders, currentQuestSubOrdersChs);
		}

		return;
	}

	setType(currentType);
});

alwaysShowQuestExtraInfoInput.addEventListener("change", () => {
	alwaysShowQuestExtraInfo = alwaysShowQuestExtraInfoInput.checked;

	localStorage.setItem("alwaysShowQuestExtraInfo", String(alwaysShowQuestExtraInfo));

	updateQuestExtraInfoVisibility();
});

window.addEventListener("keydown", event => {
	if (event.key !== "Shift" || isShiftHeld) {
		return;
	}

	isShiftHeld = true;
	updateQuestExtraInfoVisibility();
});

window.addEventListener("keyup", event => {
	if (event.key !== "Shift" || !isShiftHeld) {
		return;
	}

	isShiftHeld = false;
	updateQuestExtraInfoVisibility();
});

window.addEventListener("blur", () => {
	isShiftHeld = false;
	updateQuestExtraInfoVisibility();
});

loadPage().catch(error => {
	dialogueLines.textContent = error.message;
});