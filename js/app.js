/*  
======================================================
  Menu Handling
======================================================  
*/

const menuButtons = document.querySelectorAll(".menu-btn");
const menus = document.querySelectorAll(".menu-dropdown");

function closeAllMenus() {
  menus.forEach(menu => menu.classList.remove("open"));
}

menuButtons.forEach(button => {
  button.addEventListener("click", (e) => {
    e.stopPropagation();

    const menuName = button.dataset.menu;
    const menu = menuName
      ? document.querySelector(`.menu-dropdown[data-menu="${menuName}"]`)
      : null;

    if (!menu) {
      closeAllMenus();
      return;
    }

    const isOpen = menu.classList.contains("open");

    closeAllMenus();

    if (!isOpen) {
      menu.classList.add("open");
    }
  });
});

// click-away closes everything
document.addEventListener("click", () => {
  closeAllMenus();
});

// clicks inside menus should NOT close them
menus.forEach(menu => {
  menu.addEventListener("click", e => e.stopPropagation());
});

const infoBtn = document.getElementById("info-btn");
const infoPanel = document.getElementById("info-panel");
const infoClose = document.getElementById("info-close");

infoBtn.addEventListener("click", () => {
  infoPanel.classList.toggle("open");
});

infoClose.addEventListener("click", () => {
  infoPanel.classList.remove("open");
});

/*
======================================================
  Page template creation handling
======================================================
*/

const BAR_TEMPLATES = {
  0: [0, 32],
  2: [0, 16, 32],
  4: [0, 8, 16, 24, 32],
  8: [0, 4, 8, 12, 16, 20, 24, 28, 32]
};

function createHeader(isFirstPage, pageNumber) {
  const header = document.createElement("div");
  header.classList.add("header");
  if (!isFirstPage) header.classList.add("running-header");

  const fields = [
    { cls: "dedication-field", editable: true,  placeholder: "Dedication"        },
    { cls: "page-number",      editable: false, placeholder: null               },
    { cls: "title-field",      editable: true,  placeholder: "Title"      },
    { cls: "subtitle-field",   editable: true,  placeholder: "Subtitle"   },
    { cls: "tuning-field",     editable: true,  placeholder: "Tuning"     },
    { cls: "time-sig-field",   editable: true,  placeholder: "Time"       },
    { cls: "arranger-field",   editable: true,  placeholder: "Arranger"   },
  ];

  fields.forEach(({ cls, editable, placeholder }) => {
    const div = document.createElement("div");
    div.classList.add(cls);
    if (placeholder !== null) div.dataset.placeholder = placeholder;
    if (editable) {
      div.contentEditable = "true";
      div.spellcheck = false;
    }
    header.appendChild(div);
  });

  return header;
}

function createStaffUnit() {
  const block = document.createElement("div");
  block.className = "staff-unit";
  block.dataset.blockType = "staff-unit";
  block.dataset.bars = 4;
  block.dataset.barlines = JSON.stringify(buildDefaultBarlines(4));

  const metadata = document.createElement("div");
  metadata.className = "staff-metadata";

  const barNumber = document.createElement("div");
  barNumber.className = "bar-number";
  metadata.appendChild(barNumber);

  ["3", "2", "1"].forEach(n => {
    const s = document.createElement("div");
    s.className = "string-number";
    s.textContent = n;
    metadata.appendChild(s);
  });

  const staffSection = document.createElement("div");
  staffSection.className = "staff-section";
  staffSection.appendChild(createStaffSVG());
  staffSection.appendChild(createNotationLayer());

  block.appendChild(metadata);
  block.appendChild(staffSection);

  drawBarlines(block);

  return block;
}

function createLyricUnit() {
  const block = document.createElement("div");
  block.classList.add("lyric-unit");
  block.dataset.blockType = "lyric-unit";

  const lyricPlaceholders = ["Lyric line 1", "Lyric line 2", "Lyric line 3"];

  for (let i = 0; i < 3; i++) {
    const lineDiv = document.createElement("div");
    lineDiv.classList.add("lyric-line");
    lineDiv.dataset.line = i + 1;
    lineDiv.dataset.placeholder = lyricPlaceholders[i];
    lineDiv.contentEditable = "true";
    lineDiv.spellcheck = false;
    block.appendChild(lineDiv);
  }

  return block;
}

function generatePage(pageType, pageNumber) {
  const page = document.createElement("div");
  page.classList.add("page");

  const pageContent = document.createElement("div");
  pageContent.classList.add(
    pageType === "lyric" ? "lyric-page-content" : "staff-page-content"
  );

  const isFirstPage = (pageNumber === 1);
  pageContent.appendChild(createHeader(isFirstPage, pageNumber));

  if (pageType === "staff") {
    for (let i = 0; i < 10; i++) {
      pageContent.appendChild(createStaffUnit());
    }
  } else {
    for (let i = 0; i < 5; i++) {
      pageContent.appendChild(createStaffUnit());
      pageContent.appendChild(createLyricUnit());
    }
  }

  page.appendChild(pageContent);

  const watermark = document.createElement("div");
  watermark.className = "watermark";
  watermark.textContent = (STRINGS[currentLang] || STRINGS.en).watermark;
  pageContent.appendChild(watermark);

  document.querySelector(".workspace").appendChild(page);

  // Sync title to/from running headers
  const firstTitle = document.querySelector(".page:first-child .title-field");
  const newTitle = page.querySelector(".title-field");

  if (!isFirstPage && firstTitle) {
    newTitle.textContent = firstTitle.textContent;
  }

  if (isFirstPage) {
    firstTitle.addEventListener("input", () => {
      document.querySelectorAll(".running-header .title-field").forEach(el => {
        el.textContent = firstTitle.textContent;
      });
    });
  }

  updatePageNumbers();
}

function updatePageNumbers() {
  const pageNumbers = document.querySelectorAll(".page-number");
  const total = pageNumbers.length;
  pageNumbers.forEach((el, i) => {
    el.textContent = `${i + 1}/${total}`;
  });
}



/*
======================================================
  Architecture for music notation writing
INPUT LAYER
  ├─ Palette clicks
  └─ Keyboard input
        ↓
INTENT LAYER
  └─ { action, value }
        ↓
DISPATCH LAYER
  └─ dispatchCommit(intent)
        ↓
COMMIT LAYER   ← DOM changes happen here, period
  ├─ commitTsubo
  ├─ commitRest
  ├─ commitDuration (later)
  ├─ commitClear
        ↓
DOM / NOTATION STATE
======================================================
*/

/*  
======================================================
  Input Layer - selection handling
  Selection model:
    - string-slot selection implies time-division selection
    - time-division may be selected without a slot
    - only one of each may be selected at a time
======================================================  
*/

const workspace = document.querySelector(".workspace");

let selectedSlot = null;
let selectedDivision = null;
let selectedStaffUnit = null;
let selectedBarline = null;

workspace.addEventListener("click", (e) => {
  // Alt+click on barline hit target → select barline only
  // Use elementsFromPoint so hit rects in .staff-svg (z-index 1) are found
  // even when .notation-layer (z-index 2) intercepts the event target.
  if (e.altKey) {
    const hit = document.elementsFromPoint(e.clientX, e.clientY)
      .find(el => el.classList.contains("barline-hit"));
    if (hit) {
      const staffUnit = hit.closest(".staff-unit");
      if (staffUnit) {
        selectBarline(staffUnit, parseInt(hit.dataset.posIndex));
        return;
      }
    }
  }

  // Any other click clears barline selection
  deselectBarline();

  const staffUnit = e.target.closest(".staff-unit");
  if (staffUnit !== selectedStaffUnit) {
    if (selectedStaffUnit) selectedStaffUnit.classList.remove("selected-unit");
    selectedStaffUnit = staffUnit;
    if (selectedStaffUnit) selectedStaffUnit.classList.add("selected-unit");
  }

  const slot = e.target.closest(".string-slot");
  const division = e.target.closest(".time-division");

  // Clicked outside anything meaningful
  if (!slot && !division) {
    deselectAll();
    return;
  }

  // Clicked a string slot
  if (slot) {
    selectSlot(slot);
    return;
  }

  // Clicked a division but not a slot
  if (division) {
    selectDivision(division);
  }
});

// Select slot
function selectSlot(slot) {
  if (selectedSlot === slot) return;

  deselectSlot();

  selectedSlot = slot;
  slot.classList.add("selected");

  const division = slot.closest(".time-division");
  selectDivision(division);
}

// Select division
function selectDivision(division) {
  if (!division || selectedDivision === division) return;

  deselectDivision();

  selectedDivision = division;
  division.classList.add("selected");
}


// Clearing selections
function deselectSlot() {
  if (!selectedSlot) return;
  selectedSlot.classList.remove("selected");
  selectedSlot = null;
}

function deselectDivision() {
  if (!selectedDivision) return;
  selectedDivision.classList.remove("selected");
  selectedDivision = null;
}

function deselectAll() {
  deselectSlot();
  deselectDivision();
}

function selectBarline(staffUnit, posIndex) {
  const prev = selectedBarline;
  selectedBarline = { staffUnit, posIndex };
  if (prev && prev.staffUnit !== staffUnit) {
    drawBarlines(prev.staffUnit);
  }
  drawBarlines(staffUnit);
}

function deselectBarline() {
  if (!selectedBarline) return;
  const { staffUnit } = selectedBarline;
  selectedBarline = null;
  drawBarlines(staffUnit);
}


// Keyboard Navigation              
const currentSlot = selectedSlot;
const currentDivision = selectedDivision;

const stringNum = currentSlot
  ? Number(currentSlot.dataset.string)
  : null;

document.addEventListener("keydown", (e) => {
  // Bypass header block
  if (isTypingInHeader()) return;

  const navKeys = ["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"];
  if (navKeys.includes(e.key) && (selectedSlot || selectedDivision)) {
    e.preventDefault();
  }

  switch (e.key) {
    case "ArrowUp": moveVertical(+1); break;
    case "ArrowDown": moveVertical(-1); break;
    case "ArrowLeft": moveHorizontal(-1); break;
    case "ArrowRight": moveHorizontal(+1); break;
    case "Escape": deselectAll(); break;
  }
});


function moveVertical(direction) {
  if (!selectedSlot) return;

  const division = selectedSlot.closest(".time-division");
  const currentString = Number(selectedSlot.dataset.string);
  const targetString = currentString + direction;

  const targetSlot = division.querySelector(
    `.string-slot[data-string="${targetString}"]`
  );

  if (targetSlot) {
    selectSlot(targetSlot);
  }
}

function moveHorizontal(direction) {
  if (!selectedDivision) return;

  const layer = selectedDivision.closest(".notation-layer");
  if (!layer) return;

  const index = Number(selectedDivision.dataset.timeIndex);
  const targetDivision = layer.querySelector(
    `.time-division[data-time-index="${index + direction}"]`
  );

  if (!targetDivision) return;

  // If a slot was selected, preserve string
  if (selectedSlot) {
    const stringNum = selectedSlot.dataset.string;
    const targetSlot = targetDivision.querySelector(
      `.string-slot[data-string="${stringNum}"]`
    );

    if (targetSlot) {
      selectSlot(targetSlot);
      return;
    }
  }

  // Otherwise, just select the division
  selectDivision(targetDivision);
}

/*  
======================================================
  Input Layer - palette & keyboard handling
======================================================  
*/

// Palette
const palette = document.querySelector(".palette");

palette.addEventListener("click", (e) => {
  const btn = e.target.closest(".palette-btn");
  if (!btn) return;

  handlePaletteInput(btn);
});

// Keyboard

let pendingSlot = null;
let pendingValue = "";
let pendingTimer = null;
const UPGRADE_WINDOW = 600; // ms
const DURATION_UNDERLINE_ROTATION = [null, "single", "double"];
let currentDurationUnderline = null;
let lastDurationDivision = null;

const FINGER_ROTATION = [null, "first", "second", "third"];
let currentFinger = null;
let lastFingerDivision = null;

document.addEventListener("keydown", (e) => {
  if (isTypingInHeader()) return;
  if (!selectedSlot && !selectedDivision) return;

  const intent = keyToIntent(e);
  if (!intent) return;

  // UI-only actions
  if (intent.action === "deselect") {
    deselectAll();
    return;
  }

  // Tsubo digits are handled separately
  if (intent.action === "tsubo" && /^[0-9#]$/.test(intent.value)) {
    handleTsuboDigit(intent.value);
    return;
  }

  // Duration handling
  if (intent.action === "duration-underline-rotate") {
    if (selectedDivision !== lastDurationDivision) {
      currentDurationUnderline = null;
      lastDurationDivision = selectedDivision;
    }

    currentDurationUnderline = rotateValue(
      currentDurationUnderline,
      DURATION_UNDERLINE_ROTATION
    );

    dispatchCommit({
      source: "keyboard",
      action: "duration-underline",
      value: currentDurationUnderline
    });
  }

  // Finger handling
  if (intent.action === "finger-rotate") {
    if (selectedDivision !== lastFingerDivision) {
      currentFinger = null;
      lastFingerDivision = selectedDivision;
    }

    currentFinger = rotateValue(
      currentFinger,
      FINGER_ROTATION
    );

    dispatchCommit({
      source: "keyboard",
      action: "finger",
      value: currentFinger
    });

    return;
  }

  // Suri and oshibachi handling

  if (intent.action === "suri") {
    if (!selectedSlot) return;

    const division = selectedSlot.closest(".time-division");
    if (!division) return;
    const string = selectedSlot.dataset.string;
    console.log("Input level string:", string);

    dispatchCommit({
      source: "keyboard",
      action: "suri",
      value: string
    });;
    return;
  }

  if (intent.action === "oshibachi") {
    if (!selectedSlot) return;

    const division = selectedSlot.closest(".time-division");
    if (!division) return;

    const string = selectedSlot.dataset.string;

    dispatchCommit({
      source: "keyboard",
      action: "oshibachi",
      value: string
    });
    return;
  }


  // Everything else goes straight to dispatch
  dispatchCommit({
    source: "keyboard",
    ...intent
  });
});

function handleTsuboDigit(digit) {
  if (!selectedSlot) return;

  // Slot changed → reset buffer
  if (pendingSlot !== selectedSlot) {
    clearPending();
  }
  pendingSlot = selectedSlot;

  // SECOND digit (only possible after "1")
  if (pendingValue === "1") {
    const value = "1" + digit;

    dispatchCommit({
      source: "keyboard",
      action: "tsubo",
      value
    });

    clearPending();
    return;
  }

  // FIRST digit
  if (digit === "1") {
    // Start pending window
    pendingValue = "1";

    dispatchCommit({
      source: "keyboard",
      action: "tsubo",
      value: "1"
    });

    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(clearPending, UPGRADE_WINDOW);
    return;
  }

  // Any other digit → commit immediately
  dispatchCommit({
    source: "keyboard",
    action: "tsubo",
    value: digit
  });

  clearPending();
}


function clearPending() {
  pendingSlot = null;
  pendingValue = "";
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
}

/*  
======================================================
  Intent Layer
======================================================  
*/

// Keyboard intentions
function keyToIntent(e) {
  // --- global keys --- 
  if (e.key === "Escape") {
    return { action: "deselect" };
  }

  if (e.key === "Backspace") {
    return { action: "clear" };
  }

  // --- tsubo characters ---
  if (/^[0-9#]$/.test(e.key)) {
    return { action: "tsubo", value: e.key };
  }
  
  if (e.key === "r") {
    return { action: "rest" };
  }
  
  if (e.key === "b") {
    return { action: "tsubo", value: "♭" };
  }

  // --- duration ---
  if (e.key === "d") {
    return { action: "duration-underline-rotate" };
  }

  if (e.key === ".") {
    return { action: "durationDot"};
  }

  // --- technique ---
  if (e.key === "a") {
    return { action: "ha" };
  }

  if (e.key === "s") {
    return { action: "sukui" };
  }
  
  if (e.key === "h") {
    return { action: "hajiki" };
  }

  if (e.key === "k") {
    return { action: "keshi" };
  }

  if (e.key === "u") {
    return { action: "uchi" };
  }
  
  if (e.key === "m") {
  return { action: "maebachi" };
  }

  if (e.key === "i") {
    return { action: "suri" };
  }

  if (e.key === "o") {
    return { action: "oshibachi" };
  }

  // --- triplet ---
  if (e.key === "t") {
    return { action: "triplet" };
  }

  // --- finger ---
  if (e.key === "f") {
    return { action: "finger-rotate" };
  }

  return null;
}

// Palette intentions
function handlePaletteInput(btn) {
  const action = btn.dataset.action;
  let value = btn.dataset.value ?? null;

  if (!action) return;

  // Sync keyboard rotation state with explicit palette choice
  if (action === "duration-underline") {
    currentDurationUnderline = value;
    lastDurationDivision = selectedDivision;
  }

  if (action === "duration-empty") {
    commitClearDuration(selectedDivision);
  }

  if (action === "finger") {
    currentFinger = value;
    lastFingerDivision = selectedDivision;
  }

  // Suri and Oshibachi
  if (action === "suri" || action === "oshibachi") {
    if (!selectedSlot) return;

    value = selectedSlot.dataset.string; 
  }

  dispatchCommit({
    source: "palette",
    action,
    value
  });

  
}


/*  
======================================================
  Dispatch Layer
======================================================  
*/
function dispatchCommit(intent) {
  console.log("DISPATCH:", intent); // debugging only

  // "measure" only needs a selected staff unit, not a division
  if (intent.action === "measure") {
    const bars = parseInt(intent.value);
    if (!isNaN(bars)) {
      if (!selectedStaffUnit) {
        alert("Select a staff unit to change the number of measures");
        return;
      }
      setStaffBars(selectedStaffUnit, bars);
    }
    return;
  }

  if (intent.action === "barline-type") {
    commitBarlineType(intent.value);
    return;
  }

  if (!selectedDivision) return;

  // Disabled triplet divisions block all input except triplet toggle-off
  if (selectedDivision.dataset.triplet === "disabled" && intent.action !== "triplet") return;

  switch (intent.action) {
    // --- Tsubo ---
    case "tsubo":
      if (!selectedSlot) return;
      commitTsubo(selectedSlot, intent.value);
      break;

    case "rest":
      commitRest(selectedDivision);
      break;

    // --- Duration ---
    case "durationDot":
      commitDurationDot(selectedDivision);
      break;

    case "duration-underline":
      commitDurationUnderline(selectedDivision, intent.value);
      break;

    // --- Techniques ---
    case "technique":
      commitTechnique(selectedDivision, intent.value);
      break;

    case "sukui":
      commitSukui(selectedDivision, intent.value);
      break;

    case "hajiki":
      commitHajiki(selectedDivision, intent.value);
      break;

    case "keshi":
      commitKeshi(selectedDivision, intent.value);
      break;

    case "uchi":
      commitUchi(selectedDivision, intent.value);
      break;

    case "maebachi":
      commitMaebachi(selectedDivision);
      break;

    case "ha":
      commitHa(selectedDivision);
      break;

    case "suri":
      if (!selectedSlot) return;
      commitTechArc(selectedDivision, "suri", intent.value);
      break;

    case "oshibachi":
      if (!selectedSlot) return;
      commitTechArc(selectedDivision, "oshibachi", intent.value);
      break;


    case "triplet":
      commitTriplet(selectedDivision);
      break;

    // --- Finger ---
    case "finger":
      commitFinger(selectedDivision, intent.value);
      break;

    // --- Clear functions ---
    case "clear":
      if (selectedDivision.dataset.triplet) {
        commitTriplet(selectedDivision);
      } else if (selectedSlot) {
        commitClearSlot(selectedSlot);
      } else {
        commitClearDivision(selectedDivision);
      }
      break;

    case "deselect":
      deselectAll();
      break;


    default:
      console.warn("Unknown action:", intent);
  }
  // renderTechArcs();
}

/*  
======================================================
  Commit Layer
======================================================  
*/

// --- Tsubo ---
function commitImmediateTsubo(slot, value) {
  if (!slot || !value) return;

  const division = getDivisionFromSlot(slot);
  if (!division) return;

  // A tsubo cannot coexist with a rest
  commitClearRest(division);

  slot.textContent = value;
  slot.classList.add("has-tsubo");
  slot.classList.remove("has-rest");
}

function commitTsubo(slot, value) {
  commitImmediateTsubo(slot, value);
}

function commitRest(division) {
  if (!division) return;

  commitClearDuration(division);

  const slots = getStringSlots(division);
  const restSlot = getRestSlot(division);

  // Clear all slots
  slots.forEach(slot => {
    slot.textContent = "";
    slot.classList.remove("has-tsubo", "has-rest");
  });

  // Place rest on string 2
  restSlot.textContent = "●";
  restSlot.classList.add("has-rest");
}

// --- Duration ---
function commitDurationUnderline(division, type) {
  if (!division) return;

  // type: "single" | "double"
  commitClearDuration(division);

  const anchor = getBottomMostActiveSlot(division);
  if (!anchor) return;

  if (type === "single") {
    anchor.classList.add("single");
    division.dataset.durationUnderline = "single";
  }

  if (type === "double") {
    anchor.classList.add("double");
    division.dataset.durationUnderline = "double";
  }
}

function commitDurationDot(division) {
  if (!division) return;

  const anchor = getBottomMostActiveSlot(division);
  if (!anchor) return;

  const isNowOn = toggleDatasetFlag(division, "durationDot");

  anchor.classList.toggle("dotted", isNowOn);
}

// --- Techniques ---
function clearClearanceMarks(division) {
  const anchorSlot = getBottomMostActiveSlot(division);
  if (anchorSlot) {
    for (const cls of [".sukui-mark", ".hajiki-mark", ".keshi-mark", ".uchi-mark"]) {
      const el = anchorSlot.querySelector(cls);
      if (el) el.remove();
    }
  }
  delete division.dataset.sukui;
  delete division.dataset.hajiki;
  delete division.dataset.keshi;
  delete division.dataset.uchi;
}

function commitSukui(division) {
  if (!division) return;

  if (division.dataset.sukui !== "true") clearClearanceMarks(division);
  const isNowOn = toggleDatasetFlag(division, "sukui");

  const anchorSlot = getBottomMostActiveSlot(division);
  if (!anchorSlot) return;

  // Remove any existing sukui glyph in this slot
  const existing = anchorSlot.querySelector(".sukui-mark");
  if (existing) existing.remove();

  if (!isNowOn) return;

  const el = document.createElement("span");
  el.classList.add("sukui-mark");
  el.textContent = "ス";

  anchorSlot.appendChild(el);
}

function commitHajiki(division) {
  if (!division) return;

  if (division.dataset.hajiki !== "true") clearClearanceMarks(division);
  const isNowOn = toggleDatasetFlag(division, "hajiki");

  const anchorSlot = getBottomMostActiveSlot(division);
  if (!anchorSlot) return;

  // Remove any existing hajiki glyph in this slot
  const existing = anchorSlot.querySelector(".hajiki-mark");
  if (existing) existing.remove();

  if (!isNowOn) return;

  const el = document.createElement("span");
  el.classList.add("hajiki-mark");
  el.textContent = "ハ";

  anchorSlot.appendChild(el);
}

function commitKeshi(division) {
  if (!division) return;

  if (division.dataset.keshi !== "true") clearClearanceMarks(division);
  const isNowOn = toggleDatasetFlag(division, "keshi");

  const anchorSlot = getBottomMostActiveSlot(division);
  if (!anchorSlot) return;

  // Remove any existing keshi glyph in this slot
  const existing = anchorSlot.querySelector(".keshi-mark");
  if (existing) existing.remove();

  if (!isNowOn) return;

  const el = document.createElement("span");
  el.classList.add("keshi-mark");
  el.textContent = "ケ";

  anchorSlot.appendChild(el);
}

function commitUchi(division) {
  if (!division) return;

  if (division.dataset.uchi !== "true") clearClearanceMarks(division);
  const isNowOn = toggleDatasetFlag(division, "uchi");

  const anchorSlot = getBottomMostActiveSlot(division);
  if (!anchorSlot) return;

  // Remove any existing uchi glyph in this slot
  const existing = anchorSlot.querySelector(".uchi-mark");
  if (existing) existing.remove();

  if (!isNowOn) return;

  const el = document.createElement("span");
  el.classList.add("uchi-mark");
  el.textContent = "ウ";

  anchorSlot.appendChild(el);
}

function commitMaebachi(division) {
  if (!division) return;

  const zone = division.querySelector(".below-zone");
  if (!zone) return;

  const isNowOn = toggleDatasetFlag(division, "maebachi");

  zone.innerHTML = isNowOn ? "前" : "";
}

function commitHa(division) {
  if (!division) return;

  const zone = division.querySelector(".above-zone");
  if (!zone) return;

  const isNowOn = toggleDatasetFlag(division, "ha");

  // above-zone is exclusive
  zone.innerHTML = "";

  if (!isNowOn) return;

  const el = document.createElement("span");
  el.classList.add("ha-mark");
  el.textContent = "ハ!";
  zone.appendChild(el);
}

function commitTechArc(division, type, string) {
  if (!division) return;
  console.log("commitTechArc reached"); // debugging
  console.log("division:", division); // debugging
  console.log("type:", type); // debugging
  console.log("string:", string); // debugging

  // --- Toggle off ---
  if (division.dataset.techArc === type) {
    delete division.dataset.techArc;
    delete division.dataset.techArcString;
    delete division.dataset.techArcOffset;

    renderTechArcs();

    return;
  }

  console.log("checkpoint 1 - after toggle off"); // debugging
  console.log("string value:", string, typeof string);


  // --- Require start slot with tsubo ---
  const slots = division.querySelectorAll(".string-slot");

  console.log("DEBUG slots in division:", slots.length);

  slots.forEach(slot => {
    console.log({
      stringArg: string,
      slotString: slot.dataset.string,
      hasTsuboClass: slot.classList.contains("has-tsubo"),
      classList: [...slot.classList],
      text: slot.textContent.trim(),
      slot
    });
  });

  const startSlot = [...slots].find(
    slot =>
      slot.dataset.string === String(string) &&
      slot.classList.contains("has-tsubo")
  );

  console.log("RESOLVED startSlot:", startSlot);

  if (!startSlot) return;


  console.log("checkpoint 2 - declare startSlot", startSlot); // debugging

  const layer = division.closest(".notation-layer");
  if (!layer) return;

  const divisions = Array.from(
    layer.querySelectorAll(".time-division")
  );

  const startIndex = divisions.indexOf(division);
  if (startIndex === -1) return;

  console.log("startIndex:", startIndex);  // debugging

  // --- Find target ---
  let targetDivision = null;

  for (let i = startIndex + 1; i < divisions.length; i++) {
    const div = divisions[i];

    const targetString =
      type === "oshibachi" ? Number(string) + 1 : Number(string);

    const slot = div.querySelector(
      `.string-slot[data-string="${targetString}"].has-tsubo`
    );

    if (slot) {
      targetDivision = div;
      break;
    }
  }

  if (!targetDivision) return;

  const offset = divisions.indexOf(targetDivision) - startIndex;
  if (offset <= 0) return;

  console.log("offset:", offset);

  // --- Store ---
  division.dataset.techArc = type;               // "suri" | "oshibachi"
  division.dataset.techArcString = String(string);
  division.dataset.techArcOffset = String(offset);

  renderTechArcs();
}


// --- Triplet ---
function commitTriplet(division) {
  if (!division) return;

  const layer = division.closest(".notation-layer");
  if (!layer) return;

  const divisions = Array.from(layer.querySelectorAll(".time-division"));

  // --- Toggle off: from any active triplet division ---
  const tripletPos = division.dataset.triplet;
  if (tripletPos === "1" || tripletPos === "2" || tripletPos === "3") {
    // Find division 1 of this group
    const timeIndex = Number(division.dataset.timeIndex);
    const offset = Number(tripletPos) - 1;
    const startIndex = divisions.indexOf(division) - offset;

    for (let i = startIndex; i < startIndex + 4; i++) {
      if (divisions[i]) {
        delete divisions[i].dataset.triplet;
        divisions[i].classList.remove("triplet-active", "triplet-disabled");
      }
    }

    renderTripletBrackets();
    return;
  }

  // --- Toggle on ---
  const startIndex = divisions.indexOf(division);

  // Need 3 more divisions ahead (positions 2, 3, 4)
  if (startIndex + 3 >= divisions.length) return;

  // Check none of the 4 divisions are already in a triplet
  for (let i = startIndex; i < startIndex + 4; i++) {
    if (divisions[i].dataset.triplet) return;
  }

  divisions[startIndex].dataset.triplet     = "1";
  divisions[startIndex + 1].dataset.triplet = "2";
  divisions[startIndex + 2].dataset.triplet = "3";
  divisions[startIndex + 3].dataset.triplet = "disabled";

  divisions[startIndex].classList.add("triplet-active");
  divisions[startIndex + 1].classList.add("triplet-active");
  divisions[startIndex + 2].classList.add("triplet-active");
  divisions[startIndex + 3].classList.add("triplet-disabled");

  renderTripletBrackets();
}

// Single source of truth for .arc-layer rendering.
// Clears the layer, then redraws tech arcs AND triplet brackets from
// the time-division data attributes — so neither can erase the other.
function renderArcLayer(staffBlock) {
  const svg = staffBlock.querySelector(".arc-layer");
  if (!svg) return;

  svg.innerHTML = "";

  const divisions = Array.from(staffBlock.querySelectorAll(".time-division"));

  // --- Tech arcs ---
  divisions.forEach((division, startIndex) => {
    const type   = division.dataset.techArc;
    const string = division.dataset.techArcString;
    const offset = Number(division.dataset.techArcOffset);

    if (!type || !string || !offset) return;

    const startSlot = division.querySelector(
      `.string-slot[data-string="${string}"].has-tsubo`
    );
    if (!startSlot) return;

    const targetDivision = divisions[startIndex + offset];
    if (!targetDivision) return;

    const targetString =
      type === "oshibachi" ? Number(string) + 1 : Number(string);

    const targetSlot = targetDivision.querySelector(
      `.string-slot[data-string="${targetString}"].has-tsubo`
    );
    if (!targetSlot) return;

    const start = getSlotAnchor(startSlot);
    const end   = getSlotAnchor(targetSlot);
    if (!start || !end) return;

    drawArc(svg, start, end, type);
  });

  // --- Triplet brackets ---
  divisions.forEach(division => {
    if (division.dataset.triplet !== "1") return;

    const startIndex = divisions.indexOf(division);
    const div1 = divisions[startIndex];
    const div3 = divisions[startIndex + 2];
    if (!div1 || !div3) return;

    const below1 = div1.querySelector(".below-zone");
    const below3 = div3.querySelector(".below-zone");
    if (!below1 || !below3) return;

    const layerRect = svg.closest(".notation-layer").getBoundingClientRect();
    const r1 = below1.getBoundingClientRect();
    const r3 = below3.getBoundingClientRect();

    const x1 = r1.left - layerRect.left;
    const x2 = r3.right - layerRect.left;
    const midY = r1.top - layerRect.top + r1.height / 2;
    const tickHalf = r1.height * 0.5;
    const midX = (x1 + x2) / 2;

    // Append "3" text first so getBoundingClientRect() returns real geometry
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", midX);
    text.setAttribute("y", midY);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "middle");
    text.setAttribute("font-size", "6");
    text.setAttribute("font-family", "IBM Plex Sans JP, sans-serif");
    text.classList.add("triplet-bracket");
    text.textContent = "3";
    svg.appendChild(text);

    const textRect = text.getBoundingClientRect();
    const textLeft  = textRect.left  - layerRect.left;
    const textRight = textRect.right - layerRect.left;
    const bracketGap = 2;

    const leftPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    leftPath.setAttribute("d",
      `M ${textLeft - bracketGap} ${midY} L ${x1} ${midY} M ${x1} ${midY - tickHalf} L ${x1} ${midY}`
    );
    leftPath.setAttribute("fill", "none");
    leftPath.setAttribute("stroke", "black");
    leftPath.setAttribute("stroke-width", "1");
    leftPath.classList.add("triplet-bracket");

    const rightPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    rightPath.setAttribute("d",
      `M ${textRight + bracketGap} ${midY} L ${x2} ${midY} M ${x2} ${midY - tickHalf} L ${x2} ${midY}`
    );
    rightPath.setAttribute("fill", "none");
    rightPath.setAttribute("stroke", "black");
    rightPath.setAttribute("stroke-width", "1");
    rightPath.classList.add("triplet-bracket");

    svg.appendChild(leftPath);
    svg.appendChild(rightPath);
  });
}

function renderTripletBrackets() {
  document.querySelectorAll(".staff-unit").forEach(renderArcLayer);
}

// --- Finger ---
function commitFinger(division, type) {
  if (!division) return;

  const zone = division.querySelector(".above-zone");
  if (!zone) return;

  // Always clear existing
  zone.innerHTML = "";

  // Persist finger state so save can read it from data attributes
  if (type) {
    division.dataset.finger = type;
  } else {
    delete division.dataset.finger;
  }

  // Null means "no finger"
  if (!type) return;

  const el = document.createElement("span");
  el.classList.add("finger-mark");

  if (type === "first") el.textContent = "Ⅰ";
  if (type === "second") el.textContent = "Ⅱ";
  if (type === "third") el.textContent = "Ⅲ";

  zone.appendChild(el);
}

// --- Commit clear functions ---
function commitClearDuration(division) {
  if (!division) return;

  delete division.dataset.durationUnderline;
  delete division.dataset.durationDot;

  const slots = Array.from(getStringSlots(division));
  slots.forEach(slot => {
    slot.classList.remove("single", "double", "dotted");
  });
}

function commitClearSlot(slot) {
  if (!slot) return;

  const division = getDivisionFromSlot(slot);

  slot.textContent = "";
  slot.classList.remove("has-tsubo", "has-rest");

  if (!division) return;

  // If no tsubo remain in this division, clear duration
  const slots = Array.from(getStringSlots(division));
  const hasAnyTsubo = slots.some(s => s.textContent !== "");

  if (!hasAnyTsubo) {
    commitClearDuration(division);
  }
}



function commitClearRest(division) {
  if (!division) return;

  const restSlot = getRestSlot(division);
  if (!restSlot.classList.contains("has-rest")) return;

  restSlot.textContent = "";
  restSlot.classList.remove("has-rest");
}

function commitClearDivision(division) {
  if (!division) return;

  getStringSlots(division).forEach(commitClearSlot);
  commitClearRest(division);
  commitClearDuration(division);

  // Clear above-zone
  const above = division.querySelector(".above-zone");
  if (above) above.innerHTML = "";
  delete division.dataset.finger;

  // Clear suri/oshibachi
  delete division.dataset.techArc;
  delete division.dataset.techArcString;
  delete division.dataset.techArcOffset;

  renderTechArcs();

}


/* ======================================================
   Helper Utilities
====================================================== */

// Selection helpers
function getDivisionFromSlot(slot) {
  return slot.closest(".time-division");
}

function getStringSlots(division) {
  return division.querySelectorAll(".string-slot");
}

function getRestSlot(division) {
  return division.querySelector('.string-slot[data-string="2"]');
}

// Keyboard input helpers
function isTypingInHeader() {
  const active = document.activeElement;
  return active &&
    (active.tagName === "INPUT" ||
     active.tagName === "TEXTAREA" ||
     active.isContentEditable ||
     active.closest(".header-block"));
}

/* 
-------------------------------------------------------
  Bar line drawing helper
-------------------------------------------------------
*/

// Barlines
function buildDefaultBarlines(bars) {
  const positions = BAR_TEMPLATES[bars] || [0, 32];
  return positions.map(p => ({ pos: p }));
}

function drawBarlines(staffBlock) {
  const svg = staffBlock.querySelector(".staff-svg");
  if (!svg) return;

  svg.querySelectorAll(".barline-group").forEach(g => g.remove());

  const data = JSON.parse(staffBlock.dataset.barlines || "[]");
  const isSelectedUnit = selectedBarline && selectedBarline.staffUnit === staffBlock;

  // Geometry — all in mm, derived from staff line stroke width
  const thin  = 0.3;               // same as .staff-line stroke-width
  const thick = thin * 2;          // 0.6mm
  const dotR  = thick / 2;         // 0.3mm  (dot diameter = thick stroke width)
  const gap   = dotR * 2;          // 0.6mm  (gap = dot diameter)
  // offset from anchor centre to neighbour centre:
  //   thin half-width + gap + neighbour half-width
  const thickOff = thin / 2 + gap + thick / 2;   // 0.15 + 0.6 + 0.3 = 1.05mm
  const dotOff   = thin / 2 + gap + dotR;         // 0.15 + 0.6 + 0.3 = 1.05mm

  data.forEach((bar, i) => {
    const x = (bar.pos / 32) * 180;
    const type = bar.type || "normal";
    const isSelected = isSelectedUnit && selectedBarline.posIndex === i;
    const color = isSelected ? "dodgerblue" : "#d3d3d3";

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.classList.add("barline-group");

    // Transparent hit target (retrieved via elementsFromPoint on Alt+click)
    const hit = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    hit.setAttribute("x", `${x - 3}mm`);
    hit.setAttribute("y", "5mm");
    hit.setAttribute("width", "6mm");
    hit.setAttribute("height", "10mm");
    hit.setAttribute("fill", "transparent");
    hit.setAttribute("pointer-events", "all");
    hit.classList.add("barline-hit");
    hit.dataset.posIndex = i;
    g.appendChild(hit);

    switch (type) {
      case "stop":
        // thin (anchor) → gap → thick (right)
        g.appendChild(makeLine(x,             6, 14, color, `${thin}mm`));
        g.appendChild(makeLine(x + thickOff,  6, 14, color, `${thick}mm`));
        break;

      case "open-repeat":
        // thick (left) → gap → thin (anchor) → gap → dots (right)
        g.appendChild(makeLine(x - thickOff,  6, 14, color, `${thick}mm`));
        g.appendChild(makeLine(x,             6, 14, color, `${thin}mm`));
        g.appendChild(makeCircle(x + dotOff,  8,  dotR, color));
        g.appendChild(makeCircle(x + dotOff, 12,  dotR, color));
        break;

      case "close-repeat":
        // dots (left) → gap → thin (anchor) → gap → thick (right)
        g.appendChild(makeCircle(x - dotOff,  8,  dotR, color));
        g.appendChild(makeCircle(x - dotOff, 12,  dotR, color));
        g.appendChild(makeLine(x,             6, 14, color, `${thin}mm`));
        g.appendChild(makeLine(x + thickOff,  6, 14, color, `${thick}mm`));
        break;

      case "normal":
      default:
        g.appendChild(makeLine(x, 6, 14, color, `${thin}mm`));
        break;
    }

    svg.appendChild(g);
  });
}

function makeLine(x, y1, y2, stroke, strokeWidth) {
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", `${x}mm`);
  line.setAttribute("y1", `${y1}mm`);
  line.setAttribute("x2", `${x}mm`);
  line.setAttribute("y2", `${y2}mm`);
  line.setAttribute("stroke", stroke);
  line.setAttribute("stroke-width", strokeWidth);
  return line;
}

function makeCircle(cx, cy, r, fill) {
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", `${cx}mm`);
  circle.setAttribute("cy", `${cy}mm`);
  circle.setAttribute("r", `${r}mm`);
  circle.setAttribute("fill", fill);
  return circle;
}


// Staff svg
function createStaffSVG(){
  const svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
  svg.classList.add("staff-svg");
  svg.setAttribute("width","181mm");
  svg.setAttribute("height","20mm");

  const linesY = [6,10,14];

  linesY.forEach(y=>{
    const line = document.createElementNS("http://www.w3.org/2000/svg","line");
    line.setAttribute("x1","0mm");
    line.setAttribute("y1",`${y}mm`);
    line.setAttribute("x2","180mm");
    line.setAttribute("y2",`${y}mm`);
    line.setAttribute("class","staff-line");
    svg.appendChild(line);
  });

  return svg;
}

// Notation layer
function createNotationLayer(){
  const layer = document.createElement("div");
  layer.className = "notation-layer";

  const arcSVG = document.createElementNS("http://www.w3.org/2000/svg","svg");
  arcSVG.classList.add("arc-layer");
  layer.appendChild(arcSVG);

  for(let i=0;i<32;i++){
    const td = document.createElement("div");
    td.className = "time-division";
    td.dataset.timeIndex = i;

    const above = document.createElement("div");
    above.className = "above-zone";

    const tsubo = document.createElement("div");
    tsubo.className = "tsubo-zone";

    ["3","2","1"].forEach(s=>{
      const slot = document.createElement("div");
      slot.className = "string-slot";
      slot.dataset.string = s;
      tsubo.appendChild(slot);
    });

    const clearance = document.createElement("div");
    clearance.className = "clearance-row";

    const below = document.createElement("div");
    below.className = "below-zone";

    td.appendChild(above);
    td.appendChild(tsubo);
    td.appendChild(clearance);
    td.appendChild(below);

    layer.appendChild(td);
  }

  return layer;
}

// Bar counting and numbering
function setStaffBars(staffBlock, bars) {
  if (!BAR_TEMPLATES[bars]) return;

  staffBlock.dataset.bars = bars;
  staffBlock.dataset.barlines = JSON.stringify(buildDefaultBarlines(bars));

  drawBarlines(staffBlock);
}

function commitBarlineType(type) {
  if (!selectedBarline) return;
  const { staffUnit, posIndex } = selectedBarline;

  const barlines = JSON.parse(staffUnit.dataset.barlines || "[]");
  if (!barlines[posIndex]) return;

  if (type === "normal") {
    delete barlines[posIndex].type;
  } else {
    barlines[posIndex].type = type;
  }

  staffUnit.dataset.barlines = JSON.stringify(barlines);
  selectedBarline = null;
  drawBarlines(staffUnit);
}


/*
-------------------------------------------------------
  Notation helpers
-------------------------------------------------------
*/

function isTsuboDigit(key) {
  return (
    (key >= "0" && key <= "9") ||
    key === "#"
  );
}

// On/off toggle helper
function toggleDatasetFlag(el, key) {
  const isOn = el.dataset[key] === "true";

  if (isOn) {
    delete el.dataset[key];
    return false;
  } else {
    el.dataset[key] = "true";
    return true;
  }
}

// Rotation toggle helpers
function rotateValue(current, values) {
  const index = values.indexOf(current);
  const nextIndex = (index + 1) % values.length;

  console.log(values[nextIndex]); // For debugging
  return values[nextIndex];
}

// Find the below slot marking anchor
function getBottomMostActiveSlot(division) {
  const slots = Array.from(getStringSlots(division));

  // 1. Prefer tsubo anchors (bottom-most first)
  const tsuboSlots = slots.filter(
    s => s.classList.contains("has-tsubo")
  );

  if (tsuboSlots.length > 0) {
    return tsuboSlots[tsuboSlots.length - 1];
  }

  // 2. Fallback: rest anchor
  const restSlot = slots.find(
    s => s.classList.contains("has-rest")
  );

  return restSlot ?? null;
}

// Oshibachi and suri helpers
function renderTechArcs() {
  document.querySelectorAll(".staff-unit").forEach(renderArcLayer);
}

function getSlotAnchor(slot) {
  if (!slot) return null;

  const rect = slot.getBoundingClientRect();
  const layer = slot.closest(".notation-layer");
  if (!layer) return null;

  const layerRect = layer.getBoundingClientRect();

  return {
    x: rect.left + rect.width / 2 - layerRect.left,
    y: rect.top - layerRect.top
  };
}

function getTargetSlot(startSlot, type) {
  if (!startSlot) return null;

  const startDivision = startSlot.closest(".time-division");
  const layer = startDivision.closest(".notation-layer");
  if (!layer) return null;

  const divisions = Array.from(
    layer.querySelectorAll(".time-division")
  );

  const startIndex = divisions.indexOf(startDivision);
  const startString = Number(startSlot.dataset.string);

  let targetString = startString;

  if (type === "oshibachi") {
    targetString = startString + 1;
    if (targetString > 3) return null;
  }

  for (let i = startIndex + 1; i < divisions.length; i++) {
    const slot = divisions[i].querySelector(
      `.string-slot[data-string="${targetString}"]`
    );

    if (!slot) continue;

    if (slot.classList.contains("has-tsubo")) {
      return slot;
    }
  }

  return null;
}


function drawArc(svg, start, end, type) {
  if (!svg || !start || !end) return;

  const midX = (start.x + end.x) / 2;
  const lift = 9;

  const path = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path"
  );

  path.setAttribute(
    "d",
    `M ${start.x} ${start.y}
     Q ${midX} ${Math.min(start.y, end.y) - lift}
       ${end.x} ${end.y}`
  );

  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "black");
  path.setAttribute("stroke-width", "1");

  path.classList.add("tech-arc", type);

  svg.appendChild(path);
}

/*
======================================================
  Page menu wiring
======================================================
*/

document.getElementById("add-staff-page").addEventListener("click", () => {
  const pageNumber = document.querySelectorAll(".page").length + 1;
  generatePage("staff", pageNumber);
  closeAllMenus();
});

document.getElementById("add-lyric-page").addEventListener("click", () => {
  const pageNumber = document.querySelectorAll(".page").length + 1;
  generatePage("lyric", pageNumber);
  closeAllMenus();
});

/*
======================================================
  Save / Serialise
======================================================
*/

function serializeDocument() {
  // Header — read from the first page only (running headers mirror it)
  const firstHeader = document.querySelector(".page:first-child .header");
  const header = {};

  if (firstHeader) {
    const fieldMap = [
      ["dedication", ".dedication-field"],
      ["pageNumber",  ".page-number"],
      ["title",       ".title-field"],
      ["subtitle",    ".subtitle-field"],
      ["tuning",      ".tuning-field"],
      ["timeSig",     ".time-sig-field"],
      ["arranger",    ".arranger-field"],
    ];

    fieldMap.forEach(([key, sel]) => {
      const el = firstHeader.querySelector(sel);
      const text = el ? el.textContent.trim() : "";
      if (text) header[key] = text;
    });
  }

  // Pages
  const pages = [];
  document.querySelectorAll(".page").forEach(page => {
    const content = page.querySelector(".staff-page-content, .lyric-page-content");
    if (!content) return;

    const type = content.classList.contains("lyric-page-content") ? "lyric" : "staff";
    const blocks = [];

    content.querySelectorAll(".staff-unit, .lyric-unit").forEach(block => {
      if (block.classList.contains("staff-unit")) {
        blocks.push(serializeStaffUnit(block));
      } else {
        blocks.push(serializeLyricUnit(block));
      }
    });

    pages.push({ type, blocks });
  });

  return { header, pages };
}

function serializeStaffUnit(block) {
  const bars = Number(block.dataset.bars);

  const rawBarlines = JSON.parse(block.dataset.barlines || "[]");
  const barlines = rawBarlines.map(b => ({
    position: b.pos,
    type: b.type || "normal"
  }));

  const timeDivisions = Array.from(
    block.querySelectorAll(".time-division")
  ).map(serializeTimeDivision);

  return { type: "staff-unit", bars, barlines, timeDivisions };
}

function serializeTimeDivision(div) {
  const obj = {};

  // Rest
  if (div.querySelector(".string-slot.has-rest")) obj.rest = true;

  // Strings — only slots with tsubo content; rest marker excluded via has-tsubo
  const strings = [];
  div.querySelectorAll(".string-slot.has-tsubo").forEach(slot => {
    const tsubo = getSlotTsubo(slot);
    if (tsubo) strings.push({ string: Number(slot.dataset.string), tsubo });
  });
  if (strings.length) obj.strings = strings;

  // Duration
  if (div.dataset.durationUnderline) obj.durationUnderline = div.dataset.durationUnderline;
  if (div.dataset.durationDot === "true") obj.durationDot = true;

  // Technique boolean flags
  if (div.dataset.sukui    === "true") obj.sukui    = true;
  if (div.dataset.hajiki   === "true") obj.hajiki   = true;
  if (div.dataset.keshi    === "true") obj.keshi    = true;
  if (div.dataset.uchi     === "true") obj.uchi     = true;
  if (div.dataset.maebachi === "true") obj.maebachi = true;
  if (div.dataset.ha       === "true") obj.ha       = true;

  // Finger
  if (div.dataset.finger) obj.finger = div.dataset.finger;

  // Tech arc (suri / oshibachi)
  if (div.dataset.techArc) {
    obj.techArc       = div.dataset.techArc;
    obj.techArcString = div.dataset.techArcString;
    obj.techArcOffset = div.dataset.techArcOffset;
  }

  // Triplet
  if (div.dataset.triplet) obj.triplet = div.dataset.triplet;

  return obj;
}

// Return only the text-node content of a slot, ignoring technique-mark spans
function getSlotTsubo(slot) {
  for (const node of slot.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent.trim();
      if (t) return t;
    }
  }
  return "";
}

function serializeLyricUnit(block) {
  const lines = ["", "", ""];
  block.querySelectorAll(".lyric-line").forEach((line, i) => {
    if (i < 3) lines[i] = line.textContent;
  });
  return { type: "lyric-unit", lines };
}

function getFilename() {
  const titleEl = document.querySelector(".title-field");
  let name = titleEl ? titleEl.textContent.trim() : "";
  name = name.replace(/[/\\:*?"<>|]/g, "-");
  if (!name) name = "untitled";
  return name + ".shami";
}

function saveDocument() {
  const blob = new Blob(
    [JSON.stringify(serializeDocument(), null, 2)],
    { type: "application/json" }
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = getFilename();
  a.click();
  URL.revokeObjectURL(url);
}

// Save button in File menu
document.getElementById("save-file").addEventListener("click", () => {
  closeAllMenus();
  saveDocument();
});

// Ctrl+S — works even when focus is in a header field
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.key === "s") {
    e.preventDefault();
    saveDocument();
  }
});

/*
======================================================
  Load / Deserialise
======================================================
*/

// Hidden file input — created once, reused on every Open click
const fileInput = document.createElement("input");
fileInput.type = "file";
fileInput.accept = ".shami";
fileInput.style.display = "none";
document.body.appendChild(fileInput);

document.getElementById("open-file").addEventListener("click", () => {
  closeAllMenus();
  fileInput.click();
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;
  fileInput.value = ""; // reset so the same file can be re-opened

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const json = JSON.parse(e.target.result);
      loadDocument(json);
    } catch (err) {
      console.error("Load failed:", err);
      alert("Failed to load file.");
    }
  };
  reader.readAsText(file);
});

function loadDocument(json) {
  const { header = {}, pages = [] } = json;

  // Null out stale selection references before clearing the DOM
  selectedSlot      = null;
  selectedDivision  = null;
  selectedStaffUnit = null;
  selectedBarline   = null;

  // Clear all existing pages
  workspace.innerHTML = "";

  // Rebuild each page then restore its blocks immediately
  pages.forEach((pageData, pageIndex) => {
    const pageNumber = pageIndex + 1;
    generatePage(pageData.type, pageNumber);

    const page = workspace.lastElementChild;
    const content = page.querySelector(".staff-page-content, .lyric-page-content");
    if (!content) return;

    const staffUnits = Array.from(content.querySelectorAll(".staff-unit"));
    const lyricUnits = Array.from(content.querySelectorAll(".lyric-unit"));
    let staffIdx = 0;
    let lyricIdx = 0;

    (pageData.blocks || []).forEach(block => {
      if (block.type === "staff-unit") {
        const staffUnit = staffUnits[staffIdx++];
        if (staffUnit) restoreStaffUnit(staffUnit, block);
      } else if (block.type === "lyric-unit") {
        const lyricUnit = lyricUnits[lyricIdx++];
        if (lyricUnit) restoreLyricUnit(lyricUnit, block);
      }
    });
  });

  // Restore header fields on the first page
  // (page-number is excluded — updatePageNumbers() manages it automatically)
  const firstHeader = document.querySelector(".page:first-child .header");
  if (firstHeader) {
    const fieldMap = [
      ["dedication", ".dedication-field"],
      ["title",      ".title-field"],
      ["subtitle",   ".subtitle-field"],
      ["tuning",     ".tuning-field"],
      ["timeSig",    ".time-sig-field"],
      ["arranger",   ".arranger-field"],
    ];
    fieldMap.forEach(([key, sel]) => {
      if (header[key] != null) {
        const el = firstHeader.querySelector(sel);
        if (el) el.textContent = header[key];
      }
    });
  }

  // Sync title to all running headers (setting textContent doesn't fire "input")
  const titleVal = header.title || "";
  document.querySelectorAll(".running-header .title-field").forEach(el => {
    el.textContent = titleVal;
  });
}

function restoreStaffUnit(staffUnit, block) {
  // Reset to saved bar count (also resets barlines to default positions)
  setStaffBars(staffUnit, block.bars);

  // Overwrite barlines with the saved data
  // Saved format: { position, type } → internal format: { pos, type? }
  const internalBarlines = (block.barlines || []).map(b => {
    const obj = { pos: b.position };
    if (b.type && b.type !== "normal") obj.type = b.type;
    return obj;
  });
  staffUnit.dataset.barlines = JSON.stringify(internalBarlines);
  drawBarlines(staffUnit);

  // Restore all 32 time divisions
  const divisions = Array.from(staffUnit.querySelectorAll(".time-division"));
  (block.timeDivisions || []).forEach((divData, i) => {
    if (divisions[i]) restoreTimeDivision(divisions[i], divData);
  });

  // Single pass renders both tech arcs and triplet brackets from data attributes
  renderArcLayer(staffUnit);
}

function restoreTimeDivision(div, data) {
  if (!data) return;

  // 1. Pitch — rest and tsubo are mutually exclusive in normal operation
  if (data.rest) {
    commitRest(div);
  } else if (data.strings) {
    data.strings.forEach(entry => {
      const slot = div.querySelector(`.string-slot[data-string="${entry.string}"]`);
      if (slot) commitTsubo(slot, entry.tsubo);
    });
  }

  // 2. Duration — underline before dot (commitDurationUnderline clears the dot internally)
  if (data.durationUnderline) commitDurationUnderline(div, data.durationUnderline);
  if (data.durationDot)       commitDurationDot(div);

  // 3. Technique booleans
  if (data.sukui)    commitSukui(div);
  if (data.hajiki)   commitHajiki(div);
  if (data.keshi)    commitKeshi(div);
  if (data.uchi)     commitUchi(div);
  if (data.maebachi) commitMaebachi(div);
  if (data.ha)       commitHa(div);

  // 4. Finger
  if (data.finger) commitFinger(div, data.finger);

  // 5. Tech arc — set attributes directly; renderArcLayer is called after all
  //    divisions are processed, so we don't call renderTechArcs() here
  if (data.techArc) {
    div.dataset.techArc       = data.techArc;
    div.dataset.techArcString = String(data.techArcString);
    div.dataset.techArcOffset = String(data.techArcOffset);
  }

  // 6. Triplet — set attributes and CSS classes directly; bracket drawn by renderArcLayer
  if (data.triplet) {
    div.dataset.triplet = data.triplet;
    if (data.triplet === "disabled") {
      div.classList.add("triplet-disabled");
    } else {
      div.classList.add("triplet-active");
    }
  }
}

function restoreLyricUnit(unit, block) {
  const lines = block.lines || ["", "", ""];
  unit.querySelectorAll(".lyric-line").forEach((line, i) => {
    if (i < lines.length) line.textContent = lines[i];
  });
}

/*
======================================================
  File menu — New, Print
======================================================
*/

function newPage(type) {
  const pages = document.querySelectorAll(".page");
  if (pages.length > 0) {
    if (!confirm("You have unsaved changes. Continue?")) return;
  }

  selectedSlot      = null;
  selectedDivision  = null;
  selectedStaffUnit = null;
  selectedBarline   = null;
  workspace.innerHTML = "";

  generatePage(type, 1);
  closeAllMenus();
}

document.getElementById("new-staff-page").addEventListener("click", () => newPage("staff"));
document.getElementById("new-lyric-page").addEventListener("click", () => newPage("lyric"));

document.getElementById("print-file").addEventListener("click", () => {
  closeAllMenus();
  window.print();
});

/*
======================================================
  Page menu — Clear Page, Delete Page
======================================================
*/

// Fully wipe a single time-division element and all its data
function clearDivisionFully(div) {
  div.querySelectorAll(".string-slot").forEach(slot => {
    slot.textContent = "";
    slot.classList.remove("has-tsubo", "has-rest", "single", "double", "dotted");
  });

  delete div.dataset.durationUnderline;
  delete div.dataset.durationDot;

  const above = div.querySelector(".above-zone");
  if (above) above.innerHTML = "";

  const below = div.querySelector(".below-zone");
  if (below) below.innerHTML = "";

  delete div.dataset.sukui;
  delete div.dataset.hajiki;
  delete div.dataset.keshi;
  delete div.dataset.uchi;
  delete div.dataset.maebachi;
  delete div.dataset.ha;
  delete div.dataset.finger;

  delete div.dataset.techArc;
  delete div.dataset.techArcString;
  delete div.dataset.techArcOffset;

  delete div.dataset.triplet;
  div.classList.remove("triplet-active", "triplet-disabled");
}

// Clear all notation content in a staff unit and reset barlines to defaults
function clearStaffUnitContent(staffUnit) {
  staffUnit.querySelectorAll(".time-division").forEach(clearDivisionFully);
  renderArcLayer(staffUnit);

  const bars = parseInt(staffUnit.dataset.bars);
  staffUnit.dataset.barlines = JSON.stringify(buildDefaultBarlines(bars));
  drawBarlines(staffUnit);
}

document.getElementById("clear-page").addEventListener("click", () => {
  closeAllMenus();
  const input = prompt("Clear which page?");
  if (input === null) return;

  const n = parseInt(input);
  const pages = document.querySelectorAll(".page");
  const page = pages[n - 1];

  if (!page || isNaN(n) || n < 1) {
    alert(`Page ${n} not present for clearing.`);
    return;
  }

  page.querySelectorAll(".staff-unit").forEach(clearStaffUnitContent);
  page.querySelectorAll(".lyric-unit .lyric-line").forEach(line => {
    line.textContent = "";
  });
});

document.getElementById("delete-page").addEventListener("click", () => {
  closeAllMenus();
  const input = prompt("Delete which page?");
  if (input === null) return;

  const n = parseInt(input);
  const pages = document.querySelectorAll(".page");
  const page = pages[n - 1];

  if (!page || isNaN(n) || n < 1) {
    alert(`Page ${n} not present for deletion.`);
    return;
  }

  // Clear selection state for anything living on this page
  if (selectedSlot      && page.contains(selectedSlot))           { selectedSlot.classList.remove("selected");           selectedSlot = null; }
  if (selectedDivision  && page.contains(selectedDivision))       { selectedDivision.classList.remove("selected");       selectedDivision = null; }
  if (selectedStaffUnit && page.contains(selectedStaffUnit))      { selectedStaffUnit.classList.remove("selected-unit"); selectedStaffUnit = null; }
  if (selectedBarline   && page.contains(selectedBarline.staffUnit)) selectedBarline = null;

  page.remove();
  updatePageNumbers();
});

/*
======================================================
  Language / i18n
======================================================
*/

const STRINGS = {
  en: {
    'lang-toggle':           '日本語',
    'data-menu-file':        'File',
    'data-menu-edit':        'Edit',
    'data-menu-page':        'Page',
    'about-btn':             'About',
    'info-btn':              'Instructions',
    'kofi-btn':              'Buy me a boba',
    'new-submenu':           'New ▶',
    'new-staff-page':        'Staff Page',
    'new-lyric-page':        'Staff and Lyric Page',
    'open-file':             'Open',
    'save-file':             'Save',
    'print-file':            'Print',
    'edit-undo':             'Undo',
    'edit-redo':             'Redo',
    'edit-copy':             'Copy',
    'edit-paste':            'Paste',
    'add-staff-page':        'Add Staff Page',
    'add-lyric-page':        'Add Staff and Lyric Page',
    'clear-page':            'Clear Page',
    'delete-page':           'Delete Page',
    'palette-header-tsubo':     'Tsubo',
    'palette-header-duration':  'Duration',
    'palette-header-technique': 'Technique',
    'palette-header-finger':    'Finger',
    'palette-header-measure':   'Measure',
    'palette-header-editing':   'Editing',
    'palette-measure-0':     'Free',
    'palette-clear':         'Clear',
    'palette-copy':          'Copy',
    'palette-paste':         'Paste',
    'watermark':             'Created with ShamiTab by ShamiWorks',
  },
  ja: {
    'lang-toggle':           'English',
    'data-menu-file':        'ファイル',
    'data-menu-edit':        '編集',
    'data-menu-page':        'ページ',
    'about-btn':             'アプリについて',
    'info-btn':              '使い方',
    'kofi-btn':              'ボバをおごる',
    'new-submenu':           '新規 ▶',
    'new-staff-page':        '譜面ページ',
    'new-lyric-page':        '譜面＋歌詞ページ',
    'open-file':             '開く',
    'save-file':             '保存',
    'print-file':            '印刷',
    'edit-undo':             '元に戻す',
    'edit-redo':             'やり直す',
    'edit-copy':             'コピー',
    'edit-paste':            '貼り付け',
    'add-staff-page':        '譜面ページを追加',
    'add-lyric-page':        '譜面＋歌詞ページを追加',
    'clear-page':            'ページをクリア',
    'delete-page':           'ページを削除',
    'palette-header-tsubo':     'ツボ',
    'palette-header-duration':  '音価',
    'palette-header-technique': '奏法',
    'palette-header-finger':    '指番号',
    'palette-header-measure':   '小節',
    'palette-header-editing':   '編集',
    'palette-measure-0':     'フリー',
    'palette-clear':         'クリア',
    'palette-copy':          'コピー',
    'palette-paste':         '貼り付け',
    'watermark':             '三味ワークス「三味タブ」で作成',
  }
};

let currentLang = 'en';

function setLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('lang', lang);
  const s = STRINGS[lang];

  // Toggle button
  document.getElementById('lang-toggle').textContent = s['lang-toggle'];

  // Menubar — data-menu buttons
  document.querySelector('[data-menu="file"]').textContent = s['data-menu-file'];
  document.querySelector('[data-menu="edit"]').textContent = s['data-menu-edit'];
  document.querySelector('[data-menu="page"]').textContent = s['data-menu-page'];

  // Menu-right buttons
  document.getElementById('about-btn').textContent = s['about-btn'];
  document.getElementById('info-btn').textContent  = s['info-btn'];
  document.getElementById('kofi-btn').textContent  = s['kofi-btn'];

  // File menu
  document.getElementById('new-submenu').textContent    = s['new-submenu'];
  document.getElementById('new-staff-page').textContent = s['new-staff-page'];
  document.getElementById('new-lyric-page').textContent = s['new-lyric-page'];
  document.getElementById('open-file').textContent      = s['open-file'];
  document.getElementById('save-file').textContent      = s['save-file'];
  document.getElementById('print-file').textContent     = s['print-file'];

  // Edit menu
  document.getElementById('edit-undo').textContent  = s['edit-undo'];
  document.getElementById('edit-redo').textContent  = s['edit-redo'];
  document.getElementById('edit-copy').textContent  = s['edit-copy'];
  document.getElementById('edit-paste').textContent = s['edit-paste'];

  // Page menu
  document.getElementById('add-staff-page').textContent = s['add-staff-page'];
  document.getElementById('add-lyric-page').textContent = s['add-lyric-page'];
  document.getElementById('clear-page').textContent     = s['clear-page'];
  document.getElementById('delete-page').textContent    = s['delete-page'];

  // Palette headers (in DOM order: Tsubo, Duration, Technique, Finger, Measure, Editing)
  const paletteHeaderKeys = [
    'palette-header-tsubo',
    'palette-header-duration',
    'palette-header-technique',
    'palette-header-finger',
    'palette-header-measure',
    'palette-header-editing',
  ];
  document.querySelectorAll('.palette-header').forEach((el, i) => {
    if (paletteHeaderKeys[i]) el.textContent = s[paletteHeaderKeys[i]];
  });

  // Palette buttons
  document.querySelector('[data-action="measure"][data-value="0"]').textContent   = s['palette-measure-0'];
  document.querySelector('[data-action="clear"]').textContent                     = s['palette-clear'];
  document.querySelector('[data-action="editing"][data-value="copy"]').textContent  = s['palette-copy'];
  document.querySelector('[data-action="editing"][data-value="paste"]').textContent = s['palette-paste'];

  // Watermarks (existing pages)
  document.querySelectorAll('.watermark').forEach(el => {
    el.textContent = s['watermark'];
  });

  // Info panel — elements with data-en / data-ja
  document.querySelectorAll('[data-en]').forEach(el => {
    el.textContent = el.dataset[lang];
  });
}

// About button — open correct page for active language
document.getElementById('about-btn').addEventListener('click', () => {
  window.open(currentLang === 'ja' ? 'about-ja.html' : 'about.html', '_blank');
});

// Lang toggle button
document.getElementById('lang-toggle').addEventListener('click', () => {
  setLanguage(currentLang === 'en' ? 'ja' : 'en');
});

// Init on load
setLanguage(localStorage.getItem('lang') || 'en');

