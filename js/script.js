const DEFAULTS = {
    MAX_ROUNDS: 7,
    TOP_PLACEMENTS: 10,
    TOP_PLACEMENT_SCORES: [15,12,10,8,6,5,4,3,2,1],
    PER_KILL: 2,
    SURVIVAL_INTERVAL: 30,
    SURVIVAL_BONUS: 0
}

let SETTINGS;

if(localStorage.defaultSettings) {
    try {
        SETTINGS = JSON.parse(localStorage.defaultSettings);
    } catch (e) {}
}
loadDefaultSettings();

let resultData = {
    roundData: {},
    table: [],
    meta: {
        clean: true
    }
};

/*
 * Don't judge me for this way of creating the RegExps.
 * I think this is easier to read and maintain than simply
 * writing the whole RegExps down
 */

let FIELDS = {
    "getplayers": {
        "pID": "\\d+",
        "Player": "[^\\t]+",
        "PlayfabID": "[0-9A-F]*",
        "SquadID": "-?\\d+",
        "TeamID": "-?\\d+",
        "Kills": "\\d+",
        "Placement": "-?\\d+"
    },
    "score": {
        "Rank": "#\\d+",
        "ID": "\\d+",
        "Player": "[^\\t]+",
        "Kills": "\\d+",
        "Time": "(?:\\d+m)?\\d+s"
    }
}

/**
 * @type {{getplayers: RegExp, score: RegExp}}
 */
let REGEX = {};
for (let command in FIELDS) {
    let tmp = '^', tmp2 = '(?:[\\r\\n]+';

    for (let field in FIELDS[command]) {
        tmp += `${field}\\t`;
        tmp2 += `${FIELDS[command][field]}\\t`;
    }

    tmp = tmp.replace(/\\t$/,'');
    tmp2 = tmp2.replace(/\\t$/,'') + ")+$";

    REGEX[command] = new RegExp(tmp+tmp2);
}

/**
 *
 */
function init() {
    initSettings();
    createTopPlacementInputs();
    createRoundButtons();
    createRoundInputs();
}

function createTopPlacementInputs() {
    let tmpl = document.getElementById("tmpl-points-top");
    for (let i = 1; i <= SETTINGS.TOP_PLACEMENTS; i++) {
        if(document.getElementById( `points-top-${i}`))
            continue;

        /** @type {HTMLDivElement} */
        let clone= tmpl.cloneNode(true);
        clone.removeAttribute("id");

        clone.querySelector("span").innerText = `#${i}`;

        let input = clone.querySelector("input");
        input.value = SETTINGS.TOP_PLACEMENT_SCORES[i-1];
        input.id = `points-top-${i}`;
        input.placeholder = `Points for #${i}`;
        input.addEventListener("change", onSettingsChange);

        document.getElementById("top-settings").append(clone);
    }
}

/**
 * Creates the <button> elements for switching the round inputs
 */
function createRoundButtons() {
    let tmpl = document.createElement("button");
    tmpl.classList.add("btn", "btn-secondary");

    for (let i = 1; i <= SETTINGS.MAX_ROUNDS; i++) {
        if(document.getElementById( `rb-${i}`))
            continue;

        let clone = tmpl.cloneNode(true);
        clone.dataset["selectedRound"] = i;
        clone.innerText = i;
        clone.id = `rb-${i}`;

        if(i === 1) {
            clone.classList.add("btn-primary", "active");
            clone.classList.remove("btn-secondary");
        }

        let group = Math.floor((i - 1) / 10);

        if(!document.getElementById(`round-select${group}`)) {
            /** @type {HTMLDivElement} */
            let barTmpl = document.getElementById("tmpl-button-bar");

            let barClone= barTmpl.cloneNode(true);
            barClone.removeAttribute("id");
            barClone.querySelector("#round-select").id = `round-select${group}`;
            document.getElementById("round-buttons").appendChild(barClone);
        }

        clone.addEventListener("click", showRound);

        document.getElementById(`round-select${group}`).appendChild(clone);
    }
}

/**
 * Creates the <textarea> elements for inputting the round results
 */
function createRoundInputs() {
    let tmpl = document.getElementById("tmpl-round-input");

    for (let i = 1; i <= SETTINGS.MAX_ROUNDS; i++) {
        if(document.getElementById( `round-input-${i}`))
            continue;

        /** @type {HTMLDivElement} */
        let clone = tmpl.cloneNode(true);
        clone.id = `round-input-${i}`;
        window.test = clone.querySelector(`#roundX-getplayers`);
        clone.querySelector(`#roundX-getplayers`).id = `round${i}-getplayers`;
        clone.querySelector(`#roundX-score`).id = `round${i}-score`;
        clone.querySelector(`label[for="roundX-getplayers"]`).htmlFor = `round${i}-getplayers`;
        clone.querySelector(`label[for="roundX-score"]`).htmlFor = `round${i}-score`;
        if(i !== 1) {
            clone.classList.add("d-none");
        }

        clone.querySelectorAll(`.round-nr`).forEach(e => {
           e.innerText = i;
        });

        clone.querySelectorAll(`textarea`).forEach(e => {
           e.addEventListener("change", validateRoundInputs);
           e.addEventListener("keyup", validateRoundInputs);
        });

        document.getElementById("results").appendChild(clone);
    }
}

/**
 * Applies all settings on initial load
 */
function initSettings() {
    let el;

    el = document.getElementById("survival-bonus");
    el.value = SETTINGS.SURVIVAL_BONUS;
    el.addEventListener("change", onSettingsChange);

    el = document.getElementById("survival-interval");
    el.value = SETTINGS.SURVIVAL_INTERVAL;
    el.addEventListener("change", onSettingsChange);

    el = document.getElementById("per-kill");
    el.value = SETTINGS.PER_KILL;
    el.addEventListener("change", onSettingsChange);

    el = document.getElementById("max-rounds");
    el.value = SETTINGS.MAX_ROUNDS;

    el = document.getElementById("top-placements");
    el.value = SETTINGS.TOP_PLACEMENTS;

    el = document.getElementById("btn-apply-mp");
    el.addEventListener("click", onApplyMaxPlacements);

    el = document.getElementById("btn-apply-mr");
    el.addEventListener("click", onApplyMaxRounds);
}

/**
 * Validates the <textarea> elements for inputting the round results
 * @param {Event} e
 * @this {HTMLTextAreaElement} The element that triggered the validation event
 */
function validateRoundInputs(e) {
    if(this.dataset["type"] && REGEX[this.dataset["type"]]) {
        this.classList.remove("is-valid", "is-invalid");

        let roundNr = +this.parentElement.querySelector(".round-nr").innerText;

        if(this.value.trim()) {
            if(this.value.match(REGEX[this.dataset["type"]])) {
                this.classList.add("is-valid");
                calcData(this, roundNr);
            } else {
                this.classList.add("is-invalid");
                if(resultData.roundData[roundNr] !== undefined) {
                    delete resultData.roundData[roundNr][this.dataset["type"]];
                    delete resultData.roundData[roundNr]["combined"];
                }
            }
        } else {
            let otherType = this.dataset["type"] === "score" ? "getplayers" : "score";
            if(resultData.roundData[roundNr] !== undefined) {
                delete resultData.roundData[roundNr][this.dataset["type"]];
                delete resultData.roundData[roundNr]["combined"];
                if(resultData.roundData[roundNr][otherType] === undefined) {
                    console.log("clear");
                    delete resultData.roundData[roundNr];
                }
            }
        }

        calcTableData(roundNr);
    }
}

/**
 * Calculates the round data for the round that was validated by validateRoundInput()
 * @param {HTMLTextAreaElement} el The element that triggered the validation event
 * @param {number} roundNr
 */
function calcData(el, roundNr) {
    let type = el.dataset["type"];

    if(resultData.roundData[roundNr] === undefined)
        resultData.roundData[roundNr] = {};

    resultData.roundData[roundNr][type] = parseTSV(el.value);

    let otherType = type === "score" ? "getplayers" : "score";
    if(resultData.roundData[roundNr][otherType] !== undefined) {
        resultData.roundData[roundNr]["combined"] = combineData(
            resultData.roundData[roundNr]["getplayers"],
            resultData.roundData[roundNr]["score"]
        );
    }
}

/**
 * Switches between the pages (Settings, Results, Table)
 * @param {String} page
 */
function showPage(page) {
    if (typeof page !== typeof "") {
        return console.error(`showPage(): Expected type "String" for parameter "page" got "${typeof (page)}"!`);
    }

    let activePage = document.querySelector(".active-page");
    if (!activePage) {
        return console.error("showPage(): Couldn't find active page!");
    }

    let newActivePage = document.getElementById(page);
    if (!newActivePage) {
        return console.error("showPage(): Couldn't find new active page!");
    }

    if (activePage === newActivePage)
        return;

    if(page === "table") {
        buildTable();
    }

    activePage.classList.add("d-none");
    activePage.classList.remove("active-page");

    newActivePage.classList.remove("d-none");
    newActivePage.classList.add("active-page");

    try {
        document.querySelector(`a[data-pagelink="${activePage.id}"]`).classList.remove("active");
        document.querySelector(`a[data-pagelink="${newActivePage.id}"]`).classList.add("active");
    } catch (e) {
        return console.error(`showPage(): ${e.message}`);
    }
}

/**
 * Switches the round result inputs
 * @this {HTMLButtonElement}
 * @param {Event} e
 */
function showRound(e) {
    /** @type {HTMLButtonElement} */
    let activeEl = document.querySelector("#results button.active");
    let oldRound = activeEl.dataset["selectedRound"];
    let newRound = this.dataset["selectedRound"];
    /** @type {HTMLButtonElement} */
    let newActiveEl = document.querySelector(`#results button[data-selected-round="${newRound}"]`);

    activeEl.classList.remove("btn-primary","active");
    newActiveEl.classList.remove("btn-secondary", "btn-success", "btn-warning", "btn-danger");
    newActiveEl.classList.add("btn-primary","active");

    document.getElementById(`round-input-${oldRound}`).classList.add("d-none");
    document.getElementById(`round-input-${newRound}`).classList.remove("d-none");

    updateRoundButtons();
}

/**
 * Updates the rows of buttons to visually represent the state of the
 * round result inputs
 */
function updateRoundButtons() {
    for (let round = 1; round <= SETTINGS.MAX_ROUNDS; round++) {
        /** @type {HTMLTextAreaElement} */
        let taGetplayers = document.getElementById(`round${round}-getplayers`);
        /** @type {HTMLTextAreaElement} */
        let taScore = document.getElementById(`round${round}-score`);
        /** @type {HTMLButtonElement} */
        let button = document.querySelector(`#results button[data-selected-round="${round}"]`);

        if(button.classList.contains("active"))
            continue;

        button.classList.remove("btn-secondary", "btn-success", "btn-warning", "btn-danger");

        let taGetplayersEmpty = !taGetplayers.value.trim();
        let taScoreEmpty = !taScore.value.trim();

        if(taGetplayersEmpty && taScoreEmpty) {
            // Both are empty
            button.classList.add("btn-secondary");
        } else if(
            (taGetplayers.classList.contains("is-valid") && taScore.classList.contains("is-invalid")) ||
            (taGetplayers.classList.contains("is-invalid") && taScore.classList.contains("is-valid"))
        ) {
            // Mixed (1 valid, 1 invalid)
            button.classList.add("btn-warning");
        } else if(
            (taGetplayers.classList.contains("is-valid") && taScoreEmpty) ||
            (taGetplayersEmpty && taScore.classList.contains("is-valid")) ||
            (taGetplayers.classList.contains("is-valid") && taScore.classList.contains("is-valid"))
        ) {
            // 1 is valid, the other empty OR both are valid
            button.classList.add("btn-success");
        } else if(
            (taGetplayers.classList.contains("is-invalid") && taScoreEmpty) ||
            (taGetplayersEmpty && taScore.classList.contains("is-invalid")) ||
            (taGetplayers.classList.contains("is-invalid") && taScore.classList.contains("is-invalid"))
        ) {
            // 1 is invalid, the other empty OR both are invalid
            button.classList.add("btn-danger");
        }
    }
}

/**
 * Parses the supplied tab seperated data
 * @param {String} data
 * @returns {[Object]}
 */
function parseTSV(data) {
    let rows = data.split(/[\r\n]+/);

    let header = rows[0].split(/\t/);

    // Swap equivalent header names for internal usage
    for (let i = 0; i < header.length; i++) {
        switch (header[i]) {
            case "pID":
                header[i] = "ID";
                break;
            case "Placement":
                header[i] = "Rank";
                break;
        }
    }

    let parsedRows = [];

    for (let i = 1; i < rows.length; i++) {
        let parsedRow = {}, match, time;
        let split = rows[i].split(/\t/);
        for (let j = 0; j < split.length; j++) {
            if(match = split[j].match(/^#?(-?\d+)$/)) {
                parsedRow[header[j]] = parseInt(match[1]);
            } else if(match = split[j].match(/^(?:(\d+)m)?(\d+)s$/)) {
                time = 0;

                if(match[1] !== undefined) {
                    time += parseInt(match[1]) * 60;
                }

                time += parseInt(match[2]);

                parsedRow[header[j]] = time;
            } else {
                parsedRow[header[j]] = split[j];
            }
        }
        parsedRows.push(parsedRow);
    }

    return parsedRows;
}

/**
 *
 * @param {Array} getPlayersData
 * @param {Array} scoreData
 */
function combineData(getPlayersData, scoreData) {
    let res = [];

    for (let i = 0; i < getPlayersData.length; i++) {
        let tmp = {};
        let id = getPlayersData[i].ID;
        let set2Data = scoreData.find(v => v.ID === id);

        for (let k in getPlayersData[i]) {
            tmp[k] = getPlayersData[i][k];
        }

        for (let k in set2Data) {
            tmp[k] = set2Data[k];
        }

        res.push(tmp);
    }

    return res;
}

/**
 * Recalculates the table data
 * @param {number} [round]
 */
function calcTableData(round) {
    let min = 1, max = SETTINGS.MAX_ROUNDS;

    if(typeof(round) === typeof(1) && round >= 1 && round <= SETTINGS.MAX_ROUNDS) {
        min = round;
        max = round;
    }

    for (let i = min; i <= max; i++) {
        let roundData = resultData.roundData[i]?.combined ||
            resultData.roundData[i]?.getplayers ||
            resultData.roundData[i]?.score || null;

        // Clear existing round data
        for (let k = 0; k < resultData.table.length; k++) {
            if(resultData.table[k][i] !== undefined) {
                resultData.table[k]["total"] -= resultData.table[k][i];
                resultData.table[k]["playedRounds"]--;
                delete resultData.table[k][i];
            }
        }

        // If roundData exist, calculate new table data
        if(roundData) {
            for (let k = 0; k < roundData.length; k++) {
                let data = roundData[k], entry;

                if (data.PlayfabID === "") continue; // Empty string = Bot

                if (data.PlayfabID) {
                    entry = resultData.table.find(d => d.PlayfabID === data.PlayfabID);
                } else {
                    entry = resultData.table.find(d => d.Player === data.Player);
                }

                if (!entry) {
                    entry = {
                        Player: data.Player,
                        total: 0,
                        playedRounds: 0
                    };

                    if (data.PlayfabID)
                        entry.PlayfabID = data.PlayfabID;

                    resultData.table.push(entry);
                }

                entry[i] = (SETTINGS.TOP_PLACEMENT_SCORES[data.Rank - 1] ?? 0);
                if(data.Time) {
                    entry[i] += Math.floor(data.Time / SETTINGS.SURVIVAL_INTERVAL) * SETTINGS.SURVIVAL_BONUS;
                }

                entry["total"] += entry[i];

                entry[i] = Math.round(entry[i] * 10) / 10;
                entry["total"] = Math.round(entry["total"] * 10) / 10;

                entry.playedRounds++;
            }
        }
    }

    /*
     * Deleting round data completely by clearing the /getplayers data
     * first and then the /score data might result in a lot of bogus data
     * which we remove here
     */
    resultData.table = resultData.table.filter(v => v.playedRounds > 0);

    resultData.table.sort((a, b) => {
        // First sort for the total score
        if(a.total < b.total) {
            return 1;
        } else if (a.total > b.total) {
            return -1;
        } else { // If the total score is equal, compare played rounds
            if(a.playedRounds < b.playedRounds) {
                return 1;
            } else if (a.playedRounds > b.playedRounds) {
                return -1;
            } else {
                return 0;
            }
        }
    });

    resultData.meta.clean = false;
}

/**
 * Builds the HTML for the actual result table
 */
function buildTable() {
    if(resultData.meta.clean === true) return;

    let table = document.createElement("table");
    table.classList.add("table","table-sm","table-striped","table-bordered","leaderboard");

    let thead = document.createElement("thead");
    let tbody = document.createElement("tbody");

    let headTr = document.createElement("tr");

    let headPosTh = document.createElement("th");
    headPosTh.innerText = "#";
    headPosTh.scope = "col";
    headPosTh.classList.add("text-end");

    let headPlayerTh = document.createElement("th");
    headPlayerTh.innerText = "Player";
    headPlayerTh.scope = "col";
    headPlayerTh.classList.add("text-center");

    headTr.append(headPosTh, headPlayerTh);
    thead.append(headTr);
    table.append(thead, tbody);

    for (let i = 1; i <= SETTINGS.MAX_ROUNDS; i++) {
        if(resultData.roundData[i] !== undefined) {
            let th = document.createElement("th");
            th.scope = "col";
            th.innerText = `${i}`;
            th.classList.add("text-center");
            headTr.append(th);
        }
    }

    let headTotalTh = document.createElement("th");
    headTotalTh.innerText = "Total";
    headTotalTh.scope = "col";
    headTotalTh.classList.add("text-center");
    headTr.append(headTotalTh);

    for (let i = 0; i < resultData.table.length; i++) {
        let tr = document.createElement("tr");

        let posTh = document.createElement("th");
        posTh.scope = "row";
        posTh.innerText = `${i + 1}`;
        posTh.classList.add("text-end");
        tr.append(posTh);

        let nameTd = document.createElement("td");
        nameTd.innerText = resultData.table[i].Player;
        nameTd.classList.add("text-center");
        tr.append(nameTd);

        for (let r = 0; r < SETTINGS.MAX_ROUNDS; r++) {
            let td = document.createElement("td");
            td.classList.add("text-center");
            if(resultData.roundData[r] !== undefined) {
                if(resultData.table[i][r] !== undefined) {
                    td.innerText = `${resultData.table[i][r]}`;
                } else {
                    td.innerText = "/";
                }
                tr.append(td);
            }
        }

        let totalTd = document.createElement("td");
        totalTd.classList.add("text-center");
        totalTd.innerText = resultData.table[i]["total"];
        tr.append(totalTd);

        tbody.append(tr);
    }

    document.getElementById("result-table").innerHTML = "";
    document.getElementById("result-table").append(table);

    resultData.meta.clean = true;
}

function loadDefaultSettings() {
    SETTINGS = {};
    for (let key in DEFAULTS) {
        if(SETTINGS[key] === undefined)
            SETTINGS[key] = DEFAULTS[key];
    }
}

/**
 * Applies changes to the inputs directly to the settings
 * and recalculates the table data
 * @this {HTMLInputElement}
 * @param {Event} e
 */
function onSettingsChange(e) {
    switch (this.id) {
        case "survival-bonus":
            SETTINGS.SURVIVAL_BONUS = +this.value;
            break;
        case "survival-interval":
            SETTINGS.SURVIVAL_INTERVAL = +this.value;
            break;
        case "per-kill":
            SETTINGS.PER_KILL = +this.value;
            break;
        default: // "points-top-x"
            if(this.id.substring(0,11)) {
                let place = +this.id.substring(11);
                SETTINGS.TOP_PLACEMENT_SCORES[place-1] = +this.value;
            }
            break;
    }
    calcTableData();
}

/**
 *
 * @param {Event|true} [confirmed]
 */
function onApplyMaxPlacements(confirmed) {
    let newMax = +document.getElementById("top-placements").value;
    if(newMax > SETTINGS.TOP_PLACEMENTS) {
        SETTINGS.TOP_PLACEMENTS = newMax;

        while(SETTINGS.TOP_PLACEMENT_SCORES.length < newMax) {
            SETTINGS.TOP_PLACEMENT_SCORES.push(0);
        }

        createTopPlacementInputs();
    } else if (newMax < SETTINGS.TOP_PLACEMENTS) {
        let isEmpty = true;
        for (let i = newMax; i < SETTINGS.TOP_PLACEMENTS; i++) {
            if(SETTINGS.TOP_PLACEMENT_SCORES[i]) {
                isEmpty = false;
                break;
            }
        }

        if(!isEmpty && confirmed !== true) {
            let modal = new bootstrap.Modal(
                document.getElementById("confirm-delete-max-placements")
            );
            modal.show();
            return;
        }

        for (let i = SETTINGS.TOP_PLACEMENTS; i > newMax; i--) {
            document.getElementById(`points-top-${i}`).parentElement.parentElement.remove();
            SETTINGS.TOP_PLACEMENT_SCORES.pop();
        }

        calcTableData();

        SETTINGS.TOP_PLACEMENTS = newMax;
    }
}

/**
 *
 * @param {Event|true} [confirmed]
 */
function onApplyMaxRounds(confirmed) {
    let newMax = +document.getElementById("max-rounds").value;
    if(newMax > SETTINGS.MAX_ROUNDS) {
        SETTINGS.MAX_ROUNDS = newMax;
        createRoundInputs();
        createRoundButtons();
    } else if (newMax < SETTINGS.MAX_ROUNDS) {
        let isEmpty = true;
        for (let i = newMax+1; i < SETTINGS.MAX_ROUNDS; i++) {
            if(
                document.getElementById(`round${i}-getplayers`).value.trim() ||
                document.getElementById(`round${i}-score`).value.trim()
            ) {
                isEmpty = false;
                break;
            }
        }

        if(!isEmpty && confirmed !== true) {
            let modal = new bootstrap.Modal(
                document.getElementById("confirm-delete-max-rounds")
            );
            modal.show();
            return;
        }

        for (let i = SETTINGS.MAX_ROUNDS; i > newMax; i--) {
            document.getElementById(`round-input-${i}`).remove();
            document.getElementById(`rb-${i}`).remove();
            let children = document.getElementById("round-buttons");
            for (let k = children.length; k > 0; k--) {
                if(children[k].childElementCount === 0) {
                    children[k].remove();
                }
            }

            delete resultData.roundData[i];
            calcTableData(i);
        }

        SETTINGS.MAX_ROUNDS = newMax;
    }
}

init();