const toggle = document.getElementById("toggle-folders");

chrome.storage.local.get(["roPwnedEnabled"], (res) => {
  toggle.checked = res.roPwnedEnabled !== false;
});

toggle.addEventListener("change", () => {
  chrome.storage.local.set({ roPwnedEnabled: toggle.checked });
});
