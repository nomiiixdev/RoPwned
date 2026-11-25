let state = {
  folders: ["Squad", "Traders", "Devs"],
  openFolder: null,
  friendsData: {}
};
let isEnabled = true;

chrome.storage.local.get(["roPwnedState", "roPwnedEnabled"], (result) => {
  if (result.roPwnedState) {
    const loaded = result.roPwnedState;
    if (loaded.folders) {
      loaded.folders = loaded.folders.filter((f) => f !== "All");
    }
    // Normalize all saved friend keys to lowercase so they never mismatch
    const normalizedFriends = {};
    if (loaded.friendsData) {
      Object.keys(loaded.friendsData).forEach((k) => {
        normalizedFriends[k.toLowerCase()] = loaded.friendsData[k];
      });
    }
    loaded.friendsData = normalizedFriends;
    state = { ...state, ...loaded };
  }
  isEnabled = result.roPwnedEnabled !== false;
  runInjector();
  setInterval(runInjector, 300);
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.roPwnedEnabled) {
    isEnabled = changes.roPwnedEnabled.newValue;
    if (!isEnabled) {
      location.reload();
    } else {
      runInjector();
    }
  }
});

function saveState() {
  chrome.storage.local.set({ roPwnedState: state });
}

function getFriendKey(li) {
  if (li.dataset.rpUser) return li.dataset.rpUser;

  const text = li.textContent || "";
  const match = text.match(/@([A-Za-z0-9_]+)/);
  if (!match) return null;

  const username = match.at(1).toLowerCase();
  li.dataset.rpUser = username;
  return username;
}

function runInjector() {
  if (!isEnabled) return;
  const url = window.location.href.toLowerCase();
  if (!url.includes("friends") && !url.includes("connections")) return;

  const friendItems = findOriginalFriendItems();
  if (friendItems.length === 0) return;

  renderFoldersArea(friendItems);
  syncCards(friendItems);
}

function findOriginalFriendItems() {
  const allLIs = Array.from(document.querySelectorAll("li"));
  return allLIs.filter((li) => {
    if (li.closest("nav, header, #header, #navigation, .rbx-header, .rbx-left-col, #ropwned-folders-area")) {
      return false;
    }
    if (li.dataset.rpUser) return true;
    const text = li.textContent || "";
    return text.includes("@") && li.querySelector("img, a");
  });
}

function renderFoldersArea(friendItems) {
  const allPill = Array.from(document.querySelectorAll("button")).find(
    (b) => b.innerText.trim() === "All"
  );
  const firstFriend = friendItems.at(0);
  const anchor = allPill ? allPill.parentElement : (firstFriend ? firstFriend.parentElement : null);
  if (!anchor || !anchor.parentElement) return;

  let area = document.getElementById("ropwned-folders-area");
  if (!area) {
    area = document.createElement("div");
    area.id = "ropwned-folders-area";
    anchor.parentElement.insertBefore(area, anchor.nextSibling);
  }

  if (area.dataset.rendered === "true") return;
  area.dataset.rendered = "true";
  area.innerHTML = "";

  const header = document.createElement("div");
  header.className = "rp-header-row";

  const brand = document.createElement("span");
  brand.className = "rp-brand";
  brand.innerText = "📁 RoPwned Folders";
  header.appendChild(brand);

  const addBtn = document.createElement("button");
  addBtn.className = "rp-add-btn";
  addBtn.innerText = "+ Create Folder";
  addBtn.onclick = (e) => {
    e.preventDefault();
    const name = prompt("Enter new folder name:");
    if (name && name.trim() && !state.folders.includes(name.trim())) {
      state.folders.push(name.trim());
      state.openFolder = name.trim();
      saveState();
      refreshAll();
    }
  };
  header.appendChild(addBtn);
  area.appendChild(header);

  const folderGrid = document.createElement("div");
  folderGrid.className = "rp-folder-grid";

  const counts = {};
  state.folders.forEach((f) => (counts[f] = 0));
  Object.values(state.friendsData).forEach((data) => {
    if (data.folder && counts[data.folder] !== undefined) {
      counts[data.folder]++;
    }
  });

  state.folders.forEach((folder) => {
    const isOpen = state.openFolder === folder;
    const box = document.createElement("div");
    box.className = `rp-folder-box ${isOpen ? "open" : ""}`;

    const label = document.createElement("span");
    label.innerText = `${isOpen ? "📂" : "📁"} ${folder}`;

    const badge = document.createElement("span");
    badge.className = "rp-count-badge";
    badge.innerText = counts[folder] || 0;

    const delBtn = document.createElement("button");
    delBtn.className = "rp-delete-folder";
    delBtn.innerText = "×";
    delBtn.title = `Delete "${folder}" folder`;
    delBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (confirm(`Delete "${folder}"? Friends inside will move back to your main list.`)) {
        state.folders = state.folders.filter((f) => f !== folder);
        if (state.openFolder === folder) state.openFolder = null;

        Object.keys(state.friendsData).forEach((key) => {
          if (state.friendsData[key].folder === folder) {
            state.friendsData[key].folder = "";
          }
        });

        saveState();
        refreshAll();
      }
    };

    box.appendChild(label);
    box.appendChild(badge);
    box.appendChild(delBtn);

    box.onclick = (e) => {
      e.preventDefault();
      state.openFolder = isOpen ? null : folder;
      saveState();
      refreshAll();
    };

    folderGrid.appendChild(box);
  });

  area.appendChild(folderGrid);

  if (state.openFolder) {
    const drawer = document.createElement("div");
    drawer.id = "rp-open-drawer";
    drawer.className = "rp-open-drawer";
    area.appendChild(drawer);
  }
}

function syncCards(friendItems) {
  const drawer = document.getElementById("rp-open-drawer");

  friendItems.forEach((li) => {
    const friendKey = getFriendKey(li);
    if (!friendKey) return;

    li.setAttribute("data-rp-friend", friendKey);
    const userData = state.friendsData[friendKey] || { folder: "", note: "" };

    if (userData.folder && !state.folders.includes(userData.folder)) {
      state.folders.push(userData.folder);
      saveState();
    }

    if (!li.querySelector(".rp-card-controls")) {
      attachControlsToCard(li, friendKey, userData);
    }

    if (userData.folder) {
      li.style.display = "none";

      if (state.openFolder === userData.folder && drawer) {
        const emptyMsg = drawer.querySelector(".rp-empty-msg");
        if (emptyMsg) emptyMsg.remove();

        if (!drawer.querySelector(`[data-rp-clone="${friendKey}"]`)) {
          const clone = li.cloneNode(true);
          clone.style.display = "";
          clone.setAttribute("data-rp-clone", friendKey);
          const oldControls = clone.querySelector(".rp-card-controls");
          if (oldControls) oldControls.remove();
          const oldNote = clone.querySelector(".rp-note-preview");
          if (oldNote) oldNote.remove();
          attachControlsToCard(clone, friendKey, userData);
          drawer.appendChild(clone);
        }
      }
    } else {
      li.style.display = "";
    }
  });

  if (drawer && drawer.children.length === 0) {
    const emptyMsg = document.createElement("div");
    emptyMsg.className = "rp-empty-msg";
    emptyMsg.innerText = `This folder is empty. Click "📁 Move" on any friend below to put them in here!`;
    drawer.appendChild(emptyMsg);
  }
}

function attachControlsToCard(cardEl, friendKey, userData) {
  const controls = document.createElement("div");
  controls.className = "rp-card-controls";

  const folderBtn = document.createElement("button");
  folderBtn.className = "rp-mini-btn";
  folderBtn.innerText = userData.folder ? `📁 ${userData.folder}` : "📁 Move";
  folderBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const folderList = state.folders.join(", ");
    const chosen = prompt(
      `Move @${friendKey} into which folder?\nFolders: ${folderList}`,
      userData.folder || ""
    );
    if (chosen !== null && chosen.trim()) {
      const cleanFolder = chosen.trim();
      if (!state.folders.includes(cleanFolder)) {
        state.folders.push(cleanFolder);
      }
      state.friendsData[friendKey] = { ...userData, folder: cleanFolder };
      state.openFolder = cleanFolder; // Automatically opens the folder you just moved them into!
      saveState();
      refreshAll();
    }
  };

  const noteBtn = document.createElement("button");
  noteBtn.className = "rp-mini-btn";
  noteBtn.innerText = "📝 Note";
  noteBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const newNote = prompt(`Private note for @${friendKey}:`, userData.note || "");
    if (newNote !== null) {
      state.friendsData[friendKey] = { ...userData, note: newNote.trim() };
      saveState();
      refreshAll();
    }
  };

  controls.appendChild(folderBtn);
  controls.appendChild(noteBtn);

  if (userData.folder) {
    const removeBtn = document.createElement("button");
    removeBtn.className = "rp-remove-btn";
    removeBtn.innerText = "✕ Remove";
    removeBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      state.friendsData[friendKey] = { ...userData, folder: "" };
      saveState();
      refreshAll();
    };
    controls.appendChild(removeBtn);
  }

  cardEl.appendChild(controls);

  if (userData.note) {
    const noteDisplay = document.createElement("div");
    noteDisplay.className = "rp-note-preview";
    noteDisplay.title = userData.note;
    noteDisplay.innerText = `"${userData.note}"`;
    cardEl.appendChild(noteDisplay);
  }
}

function refreshAll() {
  const area = document.getElementById("ropwned-folders-area");
  if (area) area.remove();
  document.querySelectorAll(".rp-card-controls, .rp-note-preview").forEach((el) => el.remove());
  runInjector();
}
