const STORAGE_KEY = "targetLanguage";

const LANGUAGES = [
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "nl", name: "Dutch" },
  { code: "pl", name: "Polish" },
  { code: "ru", name: "Russian" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "zh", name: "Chinese (Simplified)" },
  { code: "ar", name: "Arabic" },
  { code: "hi", name: "Hindi" }
];

const select = document.getElementById("targetLanguage");
const status = document.getElementById("status");

function showStatus(message) {
  status.textContent = message;
  setTimeout(() => {
    if (status.textContent === message) {
      status.textContent = "";
    }
  }, 1500);
}

function populateLanguages() {
  for (const language of LANGUAGES) {
    const option = document.createElement("option");
    option.value = language.code;
    option.textContent = `${language.name} (${language.code})`;
    select.appendChild(option);
  }
}

async function loadSelection() {
  const saved = await chrome.storage.sync.get(STORAGE_KEY);
  const code = saved[STORAGE_KEY] || "es";
  select.value = code;
}

async function saveSelection() {
  const code = select.value;
  await chrome.storage.sync.set({ [STORAGE_KEY]: code });
  showStatus(`Saved: ${code}`);
}

populateLanguages();
loadSelection();
select.addEventListener("change", saveSelection);
