// ==UserScript==
// @name        Battle Stats Predictor
// @description Show battle stats prediction, computed by a third party service
// @version     3.6
// @namespace   tdup.battleStatsPredictor
// @match       https://www.torn.com/profiles.php*
// @match       https://www.torn.com/bringafriend.php*
// @match       https://www.torn.com/halloffame.php*
// @match       https://www.torn.com/index.php?page=people*
// @match       https://www.torn.com/factions.php*
// @match       https://www.torn.com/page.php*
// @run-at      document-end
// @grant       GM_addStyle
// @grant       GM_xmlhttpRequest
// @grant       GM_setValue
// @grant       GM_getValue
// @connect     api.torn.com
// @connect     www.lol-manager.com
// @author      TDup
// ==/UserScript==

// Based on finally.torn.FactionWallBattlestats

// Used for identification to the third party + doing torn api call when target stats are not cached yet
let LOCAL_API_KEY = localStorage["tdup.battleStatsPredictor.TornApiKey"];

// Used to compare players stats and show if you are weaker/stronger.
// Important : THIS IS NOT SENT to the backend, you can type whatever you want, it'll be used only locally to compare with the predicted stats.
var LOCAL_USE_COMPARE_MODE = localStorage["tdup.battleStatsPredictor.useCompareMode"] == "true";
let LOCAL_SCORE = localStorage["tdup.battleStatsPredictor.comparisonScore"];
let LOCAL_STATS_STR = localStorage["tdup.battleStatsPredictor.comparisonStr"];
let LOCAL_STATS_DEF = localStorage["tdup.battleStatsPredictor.comparisonDef"];
let LOCAL_STATS_SPD = localStorage["tdup.battleStatsPredictor.comparisonSpd"];
let LOCAL_STATS_DEX = localStorage["tdup.battleStatsPredictor.comparisonDex"];
let LOCAL_TBS = localStorage["tdup.battleStatsPredictor.comparisonTbs"];

let LOCAL_SHOW_PREDICTION_DETAILS = localStorage["tdup.battleStatsPredictor.showPredictionDetails"] == "true";

const LOCAL_COLORS = [
    { maxValue: 50, color: '#9EBDBA', canModify: true },
    { maxValue: 70, color: '#008000', canModify: true},
    { maxValue: 150, color: '#FFA500', canModify: true},
    { maxValue: 500, color: '#FF0000', canModify: true},
    { maxValue: 100000000, color: '#000000', canModify: false},
];

var comparisonBattleStatsText;
var scoreStrInput;
var scoreDefInput;
var scoreSpdInput;
var scoreDexInput;
var apiKeyText;
var setBattleStats;
var mainNode;

$("head").append(
    '<link '
    + 'href="https://stackpath.bootstrapcdn.com/font-awesome/4.7.0/css/font-awesome.min.css" '
    + 'rel="stylesheet" type="text/css">'
);

GM_addStyle(`
@media screen and (max-width: 1000px) {
	.members-cont .bs {
		display: none;
	}
}

.members-cont .level {
	width: 27px !important;
}

.members-cont .id {
	padding-left: 5px !important;
	width: 28px !important;
}

.members-cont .points {
	width: 42px !important;
}

.finally-bs-stat {
	font-family: monospace;
}

.finally-bs-stat > span {
	display: inline-block;
	width: 55px;
	text-align: right;
}

.faction-names {
	position: relative;
}

.finally-bs-api {
	//position: absolute;
	background: var(--main-bg);
	text-align: center;
	left: 0;
	top: 0;
	width: 100%;
	height: 100%;
    padding-bottom : 5px;
    padding-top : 5px;

}

.finally-bs-api > * {
	margin: 0 5px;
	padding: 5px;
}


.finally-bs-api > table, td, th, input {
  border: 1px;
}

.finally-bs-api > table {
  width: 100%;
  border-collapse: collapse;
}


.finally-bs-filter {
	position: absolute !important;
	top: 25px !important;
	left: 0;
	right: 0;
	margin-left: auto;
	margin-right: auto;
	width: 120px;
	cursor: pointer;
}
.finally-bs-filter > input {
	display: block !important;
	width: 100px;
}

.finally-bs-swap {
	position: absolute;
	top: 0px;
	left: 0;
	right: 0;
	margin-left: auto;
	margin-right: auto;
	width: 100px;
	cursor: pointer;
}

.finally-bs-activeIcon {
	display: block !important;
}

.finally-bs-asc {
	border-bottom: 6px solid var(--sort-arrow-color);
	border-left: 6px solid transparent;
	border-right: 6px solid transparent;
	border-top: 0 solid transparent;
	height: 0;
	top: -8px;
	width: 0;
}

.finally-bs-desc {
	border-bottom: 0 solid transparent;
	border-left: 6px solid transparent;
	border-right: 6px solid transparent;
	border-top: 6px solid var(--sort-arrow-border-color);
	height: 0;
	top: -1px;
	width: 0;
}

.finally-bs-col {
	text-overflow: clip !important;
}

.raid-members-list .level:not(.bs) {
	width: 16px !important;
}

div.desc-wrap:not([class*='warDesc']) .finally-bs-swap {
  display: none;
}

div.desc-wrap:not([class*='warDesc']) .faction-names {
  padding-top: 100px !important;
}



.re_spy_title, .re_spy_col {
  display: none !important;
}
`);

function JSONparse(str) {
    try {
        return JSON.parse(str);
    } catch (e) { }
    return null;
}

async function VerifyIfAPIKeyValid(key, retrieveStats, callback) {
    var urlToUse = "https://api.torn.com/user/?";
    if (retrieveStats)
        urlToUse += "selections=battlestats&";

    urlToUse += "comment=BattleStatsPredictorLoginselections&key=" + key;
    return await GM_xmlhttpRequest({
        method: "GET",
        url: urlToUse,
        onload: (r) => {
            if (r.status == 429) {
                callback("Couldn't check (rate limit)");
                return;
            }
            if (r.status != 200) {
                callback(`Couldn't check (status code ${r.status})`);
                return;
            }

            let j = JSONparse(r.responseText);
            if (!j) {
                callback("Couldn't check (unexpected response)");
                return;
            }

            if (j.error && j.error.code > 0) {
                callback("No permission to retrieve stats");
                return;
            }

            if (j.status != undefined && !j.status) {
                callback(j.message || "Wrong API key?");
            }
            else {
                if (retrieveStats) {
                    LOCAL_STATS_STR = parseInt(j.strength);
                    LOCAL_STATS_DEF = parseInt(j.defense);
                    LOCAL_STATS_SPD = parseInt(j.speed);
                    LOCAL_STATS_DEX = parseInt(j.dexterity);

                    scoreStrInput.value = LOCAL_STATS_STR;
                    scoreDefInput.value = LOCAL_STATS_DEF;
                    scoreSpdInput.value = LOCAL_STATS_SPD;
                    scoreDexInput.value = LOCAL_STATS_DEX;

                    localStorage.setItem("tdup.battleStatsPredictor.comparisonStr", LOCAL_STATS_STR);
                    localStorage.setItem("tdup.battleStatsPredictor.comparisonDef", LOCAL_STATS_DEF);
                    localStorage.setItem("tdup.battleStatsPredictor.comparisonSpd", LOCAL_STATS_SPD);
                    localStorage.setItem("tdup.battleStatsPredictor.comparisonDex", LOCAL_STATS_DEX);
                }

                callback(true);
            }
        },
        onabort: () => callback("Couldn't check (aborted)"),
        onerror: () => callback("Couldn't check (error)"),
        ontimeout: () => callback("Couldn't check (timeout)")
    })
}

function UpdateLocalScore(value) {
    apiKeyText.innerHTML = "Battle Stats Predictor - " + ((!LOCAL_API_KEY) ? "Set" : "Update") + " your API key: ";
    setBattleStats.disabled = false;

    if (LOCAL_STATS_STR && LOCAL_STATS_DEF && LOCAL_STATS_SPD && LOCAL_STATS_DEX) {
        LOCAL_SCORE = parseInt(Math.sqrt(LOCAL_STATS_STR) + Math.sqrt(LOCAL_STATS_DEF) + Math.sqrt(LOCAL_STATS_SPD) + Math.sqrt(LOCAL_STATS_DEX));
        LOCAL_TBS = parseInt(LOCAL_STATS_STR) + parseInt(LOCAL_STATS_DEF) + parseInt(LOCAL_STATS_SPD) + parseInt(LOCAL_STATS_DEX);
    }
    else {
        LOCAL_SCORE = 0;
        LOCAL_TBS = 0;
    }

    if (comparisonBattleStatsText != undefined) {
        comparisonBattleStatsText.innerHTML = "<br/> TBS = " + LOCAL_TBS.toLocaleString('en-US') + " | Battle Score = " + LOCAL_SCORE.toLocaleString('en-US'); + "<br/><br/>";
    }
}

function InjectOptionMenu(node) {
    if (!node) return;

    mainNode = node;
    var topPageLinksList = node.querySelector("#top-page-links-list");
    if (topPageLinksList == undefined)
        return;

    node.style.position = "relative";

    // API KEY PART
    let apiKeyNode = document.createElement("div");
    apiKeyNode.className = "text faction-names finally-bs-api";
    apiKeyNode.style.display = (!LOCAL_API_KEY) ? "block" : "none";
    apiKeyText = document.createElement("span");
    apiKeyText.innerHTML = "Battle Stats Predictor - " + ((!LOCAL_API_KEY) ? "Set" : "Update") + " your API key: ";
    let apiKeyInput = document.createElement("input");
    if (LOCAL_API_KEY) {
        apiKeyInput.value = LOCAL_API_KEY;
    }
    let apiRegister = document.createElement("span");
    apiRegister.innerHTML = '<div style="margin-top: 5px;"><a href="https://www.torn.com/preferences.php#tab=api?step=addNewKey&title=BattleStatsPredictor&user=basic,personalstats,profile" target="_blank">Create a basic key</a></div>';
    apiRegister.innerHTML += '<div style="margin-top: 5px;"><a href="https://www.torn.com/preferences.php#tab=api?step=addNewKey&title=BattleStatsPredictor&user=basic,personalstats,profile,battlestats" target="_blank">Create a key with access to your battle stats. Those are not transmited to our server.</a></div>';


    apiKeyNode.appendChild(apiKeyText);
    apiKeyNode.appendChild(apiKeyInput);
    apiKeyNode.appendChild(apiRegister);

    // USE COMPARE MODE PART
    let compareCheckBoxNode = document.createElement("div");
    compareCheckBoxNode.className = "text faction-names finally-bs-api";
    compareCheckBoxNode.style.display = (!LOCAL_API_KEY) ? "block" : "none";

    let checkbox = document.createElement('input');
    checkbox.type = "checkbox";
    checkbox.name = "name";
    checkbox.value = "value";
    checkbox.id = "id";
    checkbox.checked = LOCAL_USE_COMPARE_MODE;
    checkbox.addEventListener("change", () => {
        LOCAL_USE_COMPARE_MODE = !LOCAL_USE_COMPARE_MODE;
        comparisonBattleStatsNode.style.display = LOCAL_USE_COMPARE_MODE ? "block" : "none";
        colorSettingsNode.style.display = LOCAL_USE_COMPARE_MODE ? "block" : "none";
        localStorage.setItem("tdup.battleStatsPredictor.useCompareMode", LOCAL_USE_COMPARE_MODE);
    });    

    var checkboxLabel = document.createElement('label')
    checkboxLabel.htmlFor = "id";
    checkboxLabel.appendChild(document.createTextNode('Use compare mode'));
    compareCheckBoxNode.appendChild(checkboxLabel);

    compareCheckBoxNode.appendChild(checkbox);

    // USE SHOW PREDICTION DETAILS
    let PredictionDetailsBoxNode = document.createElement("div");
    PredictionDetailsBoxNode.className = "text faction-names finally-bs-api";
    PredictionDetailsBoxNode.style.display = (!LOCAL_API_KEY) ? "block" : "none";

    let checkboxPredictionDetails = document.createElement('input');
    checkboxPredictionDetails.type = "checkbox";
    checkboxPredictionDetails.name = "name";
    checkboxPredictionDetails.value = "value";
    checkboxPredictionDetails.id = "id";
    checkboxPredictionDetails.checked = LOCAL_SHOW_PREDICTION_DETAILS;
    checkboxPredictionDetails.addEventListener("change", () => {
        LOCAL_SHOW_PREDICTION_DETAILS = !LOCAL_SHOW_PREDICTION_DETAILS;        
    });

    var checkboxPredictionDetailsLabel = document.createElement('label')
    checkboxPredictionDetailsLabel.htmlFor = "id";
    checkboxPredictionDetailsLabel.appendChild(document.createTextNode('Display prediction details'));
    PredictionDetailsBoxNode.appendChild(checkboxPredictionDetailsLabel);

    PredictionDetailsBoxNode.appendChild(checkboxPredictionDetails);
    

    let colorSettingsNode = document.createElement("div");
    colorSettingsNode.className = "text faction-names finally-bs-api";
    colorSettingsNode.style.display = (LOCAL_USE_COMPARE_MODE && !LOCAL_API_KEY) ? "block" : "none";

    // COMPARISON STATS PART
    let comparisonBattleStatsNode = document.createElement("div");
    comparisonBattleStatsNode.className = "text faction-names finally-bs-api";
    comparisonBattleStatsNode.style.display = (LOCAL_USE_COMPARE_MODE && !LOCAL_API_KEY) ? "block" : "none";

    var cell, raw, table;
    table = document.createElement('table');
    comparisonBattleStatsNode.appendChild(table);

    setBattleStats = document.createElement("input");
    setBattleStats.type = "button";
    setBattleStats.value = "Set with my battlestats";
    comparisonBattleStatsNode.appendChild(setBattleStats);


    // ************************** DEX ***********************
    let comparisonDex = document.createElement("label");
    comparisonDex.innerHTML = '<div style="text-align: right">Dex&nbsp</div>';
    raw = table.insertRow(0);
    cell = raw.insertCell(0);
    cell.width = '50%';
    cell.appendChild(comparisonDex);

    scoreDexInput = document.createElement("input");
    scoreDexInput.type = 'number';
    if (LOCAL_STATS_DEX) {
        scoreDexInput.value = LOCAL_STATS_DEX;
    }
    scoreDexInput.addEventListener('change', () => {
        if (scoreDexInput.value) scoreDexInput.value = parseInt(scoreDexInput.value);
        else scoreDexInput.value = 0;

        LOCAL_STATS_DEX = scoreDexInput.value;
        UpdateLocalScore();
    });
    cell = raw.insertCell(1);
    cell.style.textAlign = 'left';
    cell.appendChild(scoreDexInput);

    // ************************** SPD ***********************
    let comparisonSpd = document.createElement("label");
    comparisonSpd.innerHTML = '<div style="text-align: right">Spd&nbsp</div>';
    raw = table.insertRow(0);
    cell = raw.insertCell(0);
    cell.appendChild(comparisonSpd);

    scoreSpdInput = document.createElement("input");
    scoreSpdInput.type = 'number';
    if (LOCAL_STATS_SPD) {
        scoreSpdInput.value = LOCAL_STATS_SPD;
    }
    scoreSpdInput.addEventListener('change', () => {
        if (scoreSpdInput.value) scoreSpdInput.value = parseInt(scoreSpdInput.value);
        else scoreSpdInput.value = 0;

        LOCAL_STATS_SPD = scoreSpdInput.value;
        UpdateLocalScore();
    });
    cell = raw.insertCell(1);
    cell.style.textAlign = 'left';
    cell.appendChild(scoreSpdInput);

    // ************************** DEF ***********************
    let comparisonDef = document.createElement("label");
    comparisonDef.innerHTML = '<div style="text-align: right">Def&nbsp</div>';
    raw = table.insertRow(0);
    cell = raw.insertCell(0);
    cell.appendChild(comparisonDef);

    scoreDefInput = document.createElement("input");
    scoreDefInput.type = 'number';
    if (LOCAL_STATS_DEF) {
        scoreDefInput.value = LOCAL_STATS_DEF;
    }
    scoreDefInput.addEventListener('change', () => {
        if (scoreDefInput.value) scoreDefInput.value = parseInt(scoreDefInput.value);
        else scoreDefInput.value = 0;

        LOCAL_STATS_DEF = scoreDefInput.value;
        UpdateLocalScore();
    });
    cell = raw.insertCell(1);
    cell.style.textAlign = 'left';
    cell.appendChild(scoreDefInput);

    // ************************** STR ***********************
    let comparisonStr = document.createElement("label");
    comparisonStr.innerHTML = '<div style="text-align: right">Str&nbsp</div>';
    raw = table.insertRow(0);
    cell = raw.insertCell(0);
    cell.appendChild(comparisonStr);

    scoreStrInput = document.createElement("input");
    scoreStrInput.type = 'number';
    if (LOCAL_STATS_STR) {
        scoreStrInput.value = LOCAL_STATS_STR;
    }
    scoreStrInput.addEventListener('change', () => {
        if (scoreStrInput.value) scoreStrInput.value = parseInt(scoreStrInput.value);
        else scoreStrInput.value = 0;

        LOCAL_STATS_STR = scoreStrInput.value;
        UpdateLocalScore();
    });
    cell = raw.insertCell(1);
    cell.style.textAlign = 'left';
    cell.appendChild(scoreStrInput);

    raw = table.insertRow(0);
    cell = raw.insertCell(0);
    cell.colSpan = 2;
    cell.innerHTML = "<br/><b>[Used to show comparison through colored UI] </b><br /><i>Comparison values (Any scenario you want : Your raw stats, your effective stats, someone else stats..) </i><br/><br/>";

    comparisonBattleStatsText = document.createElement("span");
    if (LOCAL_TBS && LOCAL_SCORE) {
        comparisonBattleStatsText.innerHTML = "<br/> TBS = " + parseInt(LOCAL_TBS).toLocaleString('en-US') + " | Battle Score = " + parseInt(LOCAL_SCORE).toLocaleString('en-US'); + "<br/><br/>";
    }
    else {
        comparisonBattleStatsText.innerHTML = "<br/><br/><br/>";
    }

    comparisonBattleStatsNode.appendChild(comparisonBattleStatsText);

    
    function AddColorPanel(document, colorSettingsNode, colorItem, id)
    {               
        let divColor1 = document.createElement("div");

        let text = document.createElement("label");
        text.innerHTML = 'Until %';
        divColor1.appendChild(text);

        let colorInput2 = document.createElement("input");
        colorInput2.type = 'number';
        colorInput2.value = parseInt(colorItem.maxValue);
        colorInput2.width = '40';
        colorInput2.disabled = !colorItem.canModify;
        divColor1.appendChild(colorInput2);
        colorItem.inputNumber = colorInput2;        

        let color1 = document.createElement("input");
        color1.type = "color";
        color1.value = colorItem.color;
        divColor1.appendChild(color1);
        colorItem.inputColor = color1;

        colorSettingsNode.appendChild(divColor1);
    }

    for (var i = 0; i < LOCAL_COLORS.length; ++i) {
        var color = localStorage["tdup.battleStatsPredictor.colorSettings_color_" + i];
        if (color != undefined) {
            LOCAL_COLORS[i].color = color;
        }
        var maxvalue = localStorage["tdup.battleStatsPredictor.colorSettings_maxValue_" + i];
        if (maxvalue != undefined) {
            LOCAL_COLORS[i].maxValue = parseInt(maxvalue);
        }
        AddColorPanel(document, colorSettingsNode, LOCAL_COLORS[i]);
    }

    let configPanelSave = document.createElement("input");
    configPanelSave.type = "button";
    configPanelSave.value = "Save & Reload";
    let configPanelClose = document.createElement("input");
    configPanelClose.type = "button";
    configPanelClose.value = "Close";

    let buttonsNode = document.createElement("div");
    buttonsNode.className = "text faction-names finally-bs-api";
    buttonsNode.style.display = (!LOCAL_API_KEY) ? "block" : "none";
    buttonsNode.appendChild(configPanelSave);
    buttonsNode.appendChild(configPanelClose);

    function OnAPIKeyValidationCallback(r) {
        if (r === true) {
            apiKeyNode.style.display = "none";
            comparisonBattleStatsNode.style.display = "none";
            colorSettingsNode.style.display = "none";
            buttonsNode.style.display = "none";
            compareCheckBoxNode.style.display = "none";
            PredictionDetailsBoxNode.style.display = "none";
        }
        else {
            apiKeyNode.style.display = "block";
            compareCheckBoxNode.style.display = "block";
            PredictionDetailsBoxNode.style.display = "block";
            apiKeyText.innerHTML = `${r}: `;
        }
    }

    setBattleStats.addEventListener("click", () => {
        VerifyIfAPIKeyValid(apiKeyInput.value, true, UpdateLocalScore);
        setBattleStats.disabled = true;
    });

    configPanelSave.addEventListener("click", () => {
        apiKeyText.innerHTML = "Checking key and saving data";
        VerifyIfAPIKeyValid(apiKeyInput.value, false, OnAPIKeyValidationCallback);

        LOCAL_API_KEY = apiKeyInput.value;
        localStorage.setItem("tdup.battleStatsPredictor.TornApiKey", LOCAL_API_KEY);

        if (scoreStrInput.value && scoreDefInput.value && scoreSpdInput.value && scoreDexInput.value) {
            LOCAL_STATS_STR = parseInt(scoreStrInput.value);
            LOCAL_STATS_DEF = parseInt(scoreDefInput.value);
            LOCAL_STATS_SPD = parseInt(scoreSpdInput.value);
            LOCAL_STATS_DEX = parseInt(scoreDexInput.value);
            UpdateLocalScore();
        }
        else {
            // Wrong values, reset everything to 0
            LOCAL_STATS_STR = LOCAL_STATS_DEF = LOCAL_STATS_SPD = LOCAL_STATS_DEX = LOCAL_SCORE = LOCAL_TBS = 0;
        }

        localStorage.setItem("tdup.battleStatsPredictor.comparisonStr", LOCAL_STATS_STR);
        localStorage.setItem("tdup.battleStatsPredictor.comparisonDef", LOCAL_STATS_DEF);
        localStorage.setItem("tdup.battleStatsPredictor.comparisonSpd", LOCAL_STATS_SPD);
        localStorage.setItem("tdup.battleStatsPredictor.comparisonDex", LOCAL_STATS_DEX);
        localStorage.setItem("tdup.battleStatsPredictor.comparisonScore", LOCAL_SCORE);
        localStorage.setItem("tdup.battleStatsPredictor.comparisonTbs", LOCAL_TBS);
        localStorage.setItem("tdup.battleStatsPredictor.showPredictionDetails", LOCAL_SHOW_PREDICTION_DETAILS);

        for (var i = 0; i < LOCAL_COLORS.length; ++i) {
            LOCAL_COLORS[i].color = LOCAL_COLORS[i].inputColor.value;
            localStorage.setItem("tdup.battleStatsPredictor.colorSettings_color_" + i, LOCAL_COLORS[i].color);

            LOCAL_COLORS[i].maxValue = LOCAL_COLORS[i].inputNumber.value;
            localStorage.setItem("tdup.battleStatsPredictor.colorSettings_maxValue_" + i, LOCAL_COLORS[i].maxValue);
        }

        location.reload();
        return false;
    });
    configPanelClose.addEventListener("click", () => {
        apiKeyNode.style.display = "none";
        comparisonBattleStatsNode.style.display = "none";
        colorSettingsNode.style.display = "none";
        buttonsNode.style.display = "none";
        compareCheckBoxNode.style.display = "none";
        PredictionDetailsBoxNode.style.display = "none";
    });

    let apiKeyButton = document.createElement("a");
    apiKeyButton.className = "t-clear h c-pointer  line-h24 right ";
    apiKeyButton.innerHTML = `
		<i class="fa fa-cog" aria-hidden="true"></i><span> Update Battle Stats Predictor settings</span>
	`;

    apiKeyButton.addEventListener("click", () => {
        if (apiKeyNode.style.display == "block") {
            apiKeyNode.style.display = "none";
            comparisonBattleStatsNode.style.display = "none";
            colorSettingsNode.style.display = "none";
            buttonsNode.style.display = "none";
            compareCheckBoxNode.style.display = "none";
            PredictionDetailsBoxNode.style.display = "none";
        }
        else {
            apiKeyText.innerHTML = "Battle Stats Predictor - Update your API key: ";
            apiKeyNode.style.display = "block";
            comparisonBattleStatsNode.style.display = LOCAL_USE_COMPARE_MODE ? "block" : "none";
            colorSettingsNode.style.display = LOCAL_USE_COMPARE_MODE ? "block" : "none";
            buttonsNode.style.display = "block";
            compareCheckBoxNode.style.display = "block";
            PredictionDetailsBoxNode.style.display = "block";
        }

    });

    topPageLinksList.appendChild(apiKeyButton);
    node.appendChild(apiKeyNode);
    node.appendChild(PredictionDetailsBoxNode);
    node.appendChild(compareCheckBoxNode);
    node.appendChild(comparisonBattleStatsNode);
    node.appendChild(colorSettingsNode);
    node.appendChild(buttonsNode);
}

(function () {
    'use strict';

    var isInjected = false;
    var TargetId = -1;
    var divWhereToInject;

    var svgAttackDivFound = false;
    var divSvgAttackToColor;

    var dictDivPerPlayer = {};

    InjectOptionMenu(document.querySelector(".content-title"));

    var shouldStop = false;
    if (window.location.href.startsWith("https://www.torn.com/factions.php")) {
        shouldStop = true;
        if (window.location.href.startsWith("https://www.torn.com/factions.php?step=profile")) {
            shouldStop = false;
        }
        if (window.location.href == "https://www.torn.com/factions.php?step=your#/tab=info") {
            shouldStop = false;
        }
    }

    if (shouldStop) {
        return;
    }

    var observer = new MutationObserver(function (mutations, observer) {
        mutations.forEach(function (mutation) {
            for (const node of mutation.addedNodes) {
                if (node.querySelector) {
                    if (window.location.href.includes("https://www.torn.com/profiles.php")) {
                        var el = node.querySelectorAll('.empty-block')
                        for (var i = 0; i < el.length; ++i) {
                            if (isInjected) {
                                break;
                            }
                            divWhereToInject = el[i];
                            isInjected = true;
                            if (LOCAL_API_KEY) {
                                fetchScoreAndTBSAsync(TargetId);
                            }
                        }

                        if (!svgAttackDivFound && LOCAL_USE_COMPARE_MODE) {
                            var el2 = node.querySelectorAll('.profile-button-attack')
                            for (i = 0; i < el2.length; ++i) {
                                divSvgAttackToColor = el2[i].children[0];
                                svgAttackDivFound = true;
                            }
                        }
                    } else {
                        if (LOCAL_USE_COMPARE_MODE) {

                            if (window.location.href.includes("https://www.torn.com/factions.php")) {
                                // for faction page
                                el = node.querySelectorAll('a');
                                for (i = 0; i < el.length; ++i) {
                                    var isDone = false;
                                    var iter = el[i];
                                    if (iter.href != null) {
                                        //"https://www.torn.com/profiles.php?XID=2139172"
                                        var myArray = iter.href.split("?XID=");
                                        if (myArray.length == 2) {
                                            for (var j = 0; j < iter.children.length; ++j) {
                                                if (isDone) {
                                                    break;
                                                }
                                                var children = iter.children[j];
                                                for (var k = 0; k < children.children.length; ++k) {

                                                    if (children != undefined && children.tagName != undefined && children.tagName == "IMG") {
                                                        var playerId = parseInt(myArray[1]);
                                                        if (!(playerId in dictDivPerPlayer)) {
                                                            dictDivPerPlayer[playerId] = subChildren;
                                                            FetchInfoForPlayer(playerId);
                                                            isDone = true;
                                                            break;
                                                        }
                                                    }
                                                    else {
                                                        var subChildren = children.children[k];
                                                        if (subChildren != undefined && subChildren.tagName != undefined && subChildren.tagName == "IMG") {

                                                            var playerId = parseInt(myArray[1]);
                                                            if (!(playerId in dictDivPerPlayer)) {
                                                                dictDivPerPlayer[playerId] = children;
                                                                FetchInfoForPlayer(playerId);
                                                                isDone = true;
                                                                break;
                                                            }                                                           
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }

                                }
                                //addAPIKeyInput(node.querySelector && node.querySelector(".content-title"));
                            }

                            else {
                                // for pages with several players
                                el = document.querySelectorAll('.user.name')
                                for (i = 0; i < el.length; ++i) {
                                    {
                                        var iter = el[i];
                                        var toSplit = iter.innerHTML;
                                        var myArray = toSplit.split("[");
                                        if (myArray.length < 2)
                                            continue;

                                        myArray = myArray[1].split("]");
                                        if (myArray.length < 1)
                                            continue;

                                        var playerId = parseInt(myArray[0]);
                                        if (!(playerId in dictDivPerPlayer)) {
                                            dictDivPerPlayer[playerId] = el[i];
                                            FetchInfoForPlayer(playerId);
                                        }
                                    }

                                    //addAPIKeyInput(node.querySelector && node.querySelector(".content-title"));
                                }
                            }
                        }
                    }
                }
            }
        });
    });

    async function FetchInfoForPlayer(targetId) {
        const json = await fetchScoreAndTBS(targetId);

        let result = json.Result;
        switch (result) {
            case FAIL:
                dictDivPerPlayer[targetId].innerHTML = '<div style="position: absolute;z-index: 100;"><img style="background-color:' + colorTBS + '; border-radius: 50%;" width="16" height="16" src="https://www.freeiconspng.com/uploads/sign-red-error-icon-1.png" /></div>' + dictDivPerPlayer[targetId].innerHTML;
                //divWhereToInject.innerHTML += '<div style="font-size: 14px; text-align: left; margin-left: 20px;  margin-top:5px;">Error : ' + json.Reason + '</div>';
                return;
            case TOO_WEAK:
            //divWhereToInject.innerHTML += '<div title = "Player is too weak" style="font-size: 14px; text-align: left; margin-left: 20px;  margin-top:5px"><label style="color:#008000;">Player is too weak to give a proper estimation (soon&#169;)</label></div>';
            //return;
            case TOO_STRONG:
            //divWhereToInject.innerHTML += '<div title = "Player is too strong" style="font-size: 14px; text-align: left; margin-left: 20px;  margin-top:5px"><label style="color:#FF0000;">Player is too strong to give a proper estimation (soon&#169;)</label></div>';
            //return;
            case SUCCESS:
                {
                    if (LOCAL_USE_COMPARE_MODE) {
                        let TBS = json.TBS.toLocaleString('en-US');
                        let TBSBalanced = json.TBS_Balanced.toLocaleString('en-US');

                        var intTBS = parseInt(TBS.replaceAll(',', ''));
                        var intTBSBalanced = parseInt(TBSBalanced.replaceAll(',', ''));

                        var localTBS = parseInt(LOCAL_STATS_STR) + parseInt(LOCAL_STATS_DEF) + parseInt(LOCAL_STATS_DEX) + parseInt(LOCAL_STATS_SPD);
                        var ratioComparedToUs = 50 * (intTBS + intTBSBalanced) / localTBS;
                        var colorTBS = getColorDifference(ratioComparedToUs);
                        var urlAttack = "https://www.torn.com/loader2.php?sid=getInAttack&user2ID=" + targetId;

                        dictDivPerPlayer[targetId].innerHTML = '<div style="position: absolute;z-index: 100;"><a href="' + urlAttack + '"><img style="background-color:' + colorTBS + '; border-radius: 50%;" width="16" height="16" src="https://cdn2.iconfinder.com/data/icons/gaming-outline/32/sword_battle_rpg_weapon_attack_game-512.png" /></a></div>' + dictDivPerPlayer[targetId].innerHTML;
                    }
                    return;
                }
        }
    }

    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);
    TargetId = urlParams.get('XID');

    for (var i = 0; i < LOCAL_COLORS.length; ++i) {
        var color = localStorage["tdup.battleStatsPredictor.colorSettings_color_" + i];
        if (color != undefined) {
            LOCAL_COLORS[i].color = color;
        }
        var maxvalue = localStorage["tdup.battleStatsPredictor.colorSettings_maxValue_" + i];
        if (maxvalue != undefined) {
            LOCAL_COLORS[i].maxValue = parseInt(maxvalue);
        }
    }

    observer.observe(document, { attributes: false, childList: true, characterData: false, subtree: true });

    function getColorDifference(ratio) {
        for (var i = 0; i < LOCAL_COLORS.length; ++i) {
            if (ratio < LOCAL_COLORS[i].maxValue) {
                return LOCAL_COLORS[i].color;
            }
        }
        return "#ffc0cb"; //pink
    }

    var FAIL = 0;
    var SUCCESS = 1;
    var TOO_WEAK = 2;
    var TOO_STRONG = 3;

    async function fetchScoreAndTBSAsync(targetId) {
        const json = await fetchScoreAndTBS(targetId);

        let result = json.Result;
        switch (result) {
            case FAIL:
                divWhereToInject.innerHTML += '<div style="font-size: 14px; text-align: left; margin-left: 20px;  margin-top:5px;">Error : ' + json.Reason + '</div>';
                return;
            case TOO_WEAK:
            case TOO_STRONG:
            case SUCCESS:
                {
                    let TBSBalanced = json.TBS_Balanced.toLocaleString('en-US');
                    let TBS = json.TBS.toLocaleString('en-US');
                    let TargetScore = json.Score.toLocaleString('en-US');
                    var intTBS = parseInt(TBS.replaceAll(',', ''));
                    var localTBS = parseInt(LOCAL_STATS_STR) + parseInt(LOCAL_STATS_DEF) + parseInt(LOCAL_STATS_DEX) + parseInt(LOCAL_STATS_SPD);
                    var tbs1Ratio = 100 * intTBS / localTBS;

                    var intTbsBalanced = parseInt(TBSBalanced.replaceAll(',', ''));
                    var tbsBalancedRatio = 100 * intTbsBalanced / ((parseInt(LOCAL_SCORE) * parseInt(LOCAL_SCORE)) / 4);

                    var colorTBS = getColorDifference(tbs1Ratio);
                    var colorBalancedTBS = getColorDifference(tbsBalancedRatio);

                    var averageModelTBS = parseInt((intTBS + intTbsBalanced) / 2);
                    var ratioComparedToUs = 100 * averageModelTBS / localTBS;
                    var colorComparedToUs = getColorDifference(ratioComparedToUs);

                    if (LOCAL_USE_COMPARE_MODE) {
                        if (divSvgAttackToColor) {
                            divSvgAttackToColor.style.fill = colorComparedToUs;
                        }

                        if (result == TOO_STRONG) {
                            divWhereToInject.innerHTML += '<div style="font-size: 18px; text-align: center; margin-top:5px">Too strong to give a proper estimation</div >';
                        } else if (result == TOO_WEAK) {
                            divWhereToInject.innerHTML += '<div style="font-size: 18px; text-align: center; margin-top:5px">Too weak to give a proper estimation</div >';
                        }
                        else {
                            divWhereToInject.innerHTML += '<div style="font-size: 18px; text-align: center; margin-top:5px">TBS = ' + averageModelTBS.toLocaleString('en-US') + '<label style="color:' + colorComparedToUs + '";"> (' + ratioComparedToUs.toFixed(0) + '%) </label></div >';  
                        }

                        if (LOCAL_SHOW_PREDICTION_DETAILS) {
                            divWhereToInject.innerHTML += '<div style="font-size: 10px; text-align: left; margin-top:5px; float:left;">TBS(TBS) = ' + intTBS.toLocaleString('en-US') + '<label style="color:' + colorTBS + '";"> (' + tbs1Ratio.toFixed(0) + '%) </label></div>';
                            divWhereToInject.innerHTML += '<div style="font-size: 10px; text-align: right; margin-top:5px;float:right;">TBS(Score) = ' + intTbsBalanced.toLocaleString('en-US') + '<label style="color:' + colorBalancedTBS + '";"> (' + tbsBalancedRatio.toFixed(0) + '%) </label></div>';
                        }
                    }
                    else {

                        if (result == TOO_STRONG) {
                            divWhereToInject.innerHTML += '<div style="font-size: 18px; text-align: center; margin-top:5px">Too strong to give a proper estimation</div >';
                        } else if (result == TOO_WEAK) {
                            divWhereToInject.innerHTML += '<div style="font-size: 18px; text-align: center; margin-top:5px">Too weak to give a proper estimation</div >';
                        }
                        else {
                            divWhereToInject.innerHTML += '<div style="font-size: 18px; text-align: center; margin-top:5px">TBS = ' + averageModelTBS.toLocaleString('en-US')+ '</div >';
                        }

                        if (LOCAL_SHOW_PREDICTION_DETAILS) {
                            divWhereToInject.innerHTML += '<div style="font-size: 10px; text-align: left; margin-top:5px; float:left;">TBS(TBS) = ' + intTBS.toLocaleString('en-US') + '</div>';
                            divWhereToInject.innerHTML += '<div style="font-size: 10px; text-align: right; margin-top:5px;float:right;">TBS(Score) = ' + intTbsBalanced.toLocaleString('en-US') + '</div>';
                        }
                    }
                }
                break;
        }
    }

    function fetchScoreAndTBS(targetId) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `http://www.lol-manager.com/api/battlestats/${LOCAL_API_KEY}/${targetId}`,
                headers: {
                    'Content-Type': 'application/json'
                },
                onload: (response) => {
                    try {
                        resolve(JSON.parse(response.responseText));
                    } catch (err) {
                        reject(err);
                    }
                },
                onerror: (err) => {
                    reject(err);
                }
            });
        });
    }

})();