// ==UserScript==
// @name        Battle Stats Predictor
// @description Show battle stats prediction, computed by a third party service
// @version     2.01
// @namespace   tdup.battleStatsPredictor
// @match       https://www.torn.com/profiles.php*
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

let LOCAL_IS_FETCHING_STATS = localStorage["tdup.battleStatsPredictor.isFecthingStats"];

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

async function checkApiKey(key, retrieveStats, cb) {
    var urlToUse = "https://api.torn.com/user/?";
    if (retrieveStats)
        urlToUse += "selections=battlestats&";

    urlToUse += "comment=BattleStatsPredictorLoginselections&key=" + key;
    return await GM_xmlhttpRequest({
        method: "GET",
        url: urlToUse,
        onload: (r) => {
            if (r.status == 429) {
                cb("Couldn't check (rate limit)");
                return;
            }
            if (r.status != 200) {
                cb(`Couldn't check (status code ${r.status})`);
                return;
            }

            let j = JSONparse(r.responseText);
            if (!j) {
                cb("Couldn't check (unexpected response)");
                return;
            }

            if (j.error && j.error.code > 0) {
                cb("No permission to retrieve stats");
                return;
            }

            if (j.status != undefined && !j.status) {
                cb(j.message || "Wrong API key?");
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
                
                cb(true);
            }
        },
        onabort: () => cb("Couldn't check (aborted)"),
        onerror: () => cb("Couldn't check (error)"),
        ontimeout: () => cb("Couldn't check (timeout)")
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

var comparisonBattleStatsText;

var scoreStrInput;
var scoreDefInput;
var scoreSpdInput;
var scoreDexInput;
var apiKeyText;
var setBattleStats;

function addAPIKeyInput(node) {
    if (!node) return;

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
    apiRegister.innerHTML = '<a href="https://www.torn.com/preferences.php#tab=api?step=addNewKey&title=BattleStatsPredictor&user=basic,personalstats,profile" target="_blank">Create a basic key</a>';
    apiRegister.innerHTML += '<a href="https://www.torn.com/preferences.php#tab=api?step=addNewKey&title=BattleStatsPredictor&user=basic,personalstats,profile,battlestats" target="_blank">Create a key with access to your battle stats. Those are not transmited to our server.</a>';
    

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
        localStorage.setItem("tdup.battleStatsPredictor.useCompareMode", LOCAL_USE_COMPARE_MODE);
    });

    var checkboxLabel = document.createElement('label')
    checkboxLabel.htmlFor = "id";
    checkboxLabel.appendChild(document.createTextNode('Use compare mode'));
    compareCheckBoxNode.appendChild(checkboxLabel);

    compareCheckBoxNode.appendChild(checkbox);

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

    function checkApiKeyCb(r) {
        if (r === true) {
            apiKeyNode.style.display = "none";
            comparisonBattleStatsNode.style.display = "none";
            buttonsNode.style.display = "none";
            compareCheckBoxNode.style.display = "none";
        }
        else {
            apiKeyNode.style.display = "block";
            compareCheckBoxNode.style.display = "block";
            apiKeyText.innerHTML = `${r}: `;
        }
    }


    setBattleStats.addEventListener("click", () => {
        checkApiKey(apiKeyInput.value, true, UpdateLocalScore);
        setBattleStats.disabled = true;
    });

    configPanelSave.addEventListener("click", () => {
        apiKeyText.innerHTML = "Checking key and saving data";
        checkApiKey(apiKeyInput.value, false, checkApiKeyCb);

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

        location.reload();
        return false;
    });
    configPanelClose.addEventListener("click", () => {
        apiKeyNode.style.display = "none";
        comparisonBattleStatsNode.style.display = "none";
        buttonsNode.style.display = "none";
        compareCheckBoxNode.style.display = "none";
    });

    let apiKeyButton = document.createElement("a");
    apiKeyButton.className = "t-clear h c-pointer  line-h24 right ";
    apiKeyButton.innerHTML = `
		<i class="fa fa-cog" aria-hidden="true"></i><span> Update Battle Stats Predictor settings</span>
	`;

    apiKeyButton.addEventListener("click", () => {
        apiKeyText.innerHTML = "Battle Stats Predictor - Update your API key: ";
        apiKeyNode.style.display = "block";
        comparisonBattleStatsNode.style.display = LOCAL_USE_COMPARE_MODE ? "block" : "none";
        buttonsNode.style.display = "block";
        compareCheckBoxNode.style.display = "block";
    });

    node.querySelector("#top-page-links-list").appendChild(apiKeyButton);
    node.appendChild(apiKeyNode);
    node.appendChild(compareCheckBoxNode);
    node.appendChild(comparisonBattleStatsNode);
    node.appendChild(buttonsNode);
}

(function () {
    'use strict';

    var isInjected = false;
    var TargetId = -1;
    var divWhereToInject;

    var svgAttackDivFound = false;
    var divSvgAttackToColor;
    var isAttackCurrentlyDisabled = false;

    addAPIKeyInput(document.querySelector(".content-title"));

    var observer = new MutationObserver(function (mutations, observer) {
        mutations.forEach(function (mutation) {
            for (const node of mutation.addedNodes) {
                if (node.querySelector) {
                    var el = document.querySelectorAll('.empty-block')
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
                        var el2 = document.querySelectorAll('.profile-button-attack')
                        for (i = 0; i < el2.length; ++i) {
                            if (el2[i].className.includes("disabled")) {
                                isAttackCurrentlyDisabled = true;

                                //                          let cross = document.createElement("svg");
                                //                          cross.fill = "rgba(217, 54, 0, 0.5)";
                                //                          cross.stroke = "#d4d4d4";
                                //                          cross.width = "46";

                                //                          el2[i].appendChild(cross);
                                //<svg xmlns="http://www.w3.org/2000/svg" fill="rgba(217, 54, 0, 0.5)" stroke="#d4d4d4" stroke-width="0" width="46" height="46" viewBox="551.393 356 44 44"><path d="M556.393,363l12.061,14-12.061,14,1,1,14-11.94,14,11.94,1-1-12.06-14,12.06-14-1-1-14,11.94-14-11.94Z"></path></svg>
                            }
                            divSvgAttackToColor = el2[i].children[0];
                            svgAttackDivFound = true;
                        }
                    }

                    addAPIKeyInput(node.querySelector && node.querySelector(".content-title"));
                }
            }
        });
    });

    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);
    TargetId = urlParams.get('XID');

    observer.observe(document, { attributes: false, childList: true, characterData: false, subtree: true });

    function getColorDifference(ratio) {
        if (ratio > 150) {
            return "#FF0000"; // red
        }
        else if (ratio > 50) {
            return "#FFA500"; // orange
        }
        else {
            return "#008000"; //green
        }
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
                divWhereToInject.innerHTML += '<div title = "Player is too weak" style="font-size: 14px; text-align: left; margin-left: 20px;  margin-top:5px"><label style="color:#008000;">Player is too weak to give a proper estimation (soon&#169;)</label></div>';
                return;
            case TOO_STRONG:
                divWhereToInject.innerHTML += '<div title = "Player is too strong" style="font-size: 14px; text-align: left; margin-left: 20px;  margin-top:5px"><label style="color:#FF0000;">Player is too strong to give a proper estimation (soon&#169;)</label></div>';
                return;
            case SUCCESS:
                {
                    let TBSBalanced = json.TBS_Balanced.toLocaleString('en-US');
                    let TBS = json.TBS.toLocaleString('en-US');
                    let TargetScore = json.Score.toLocaleString('en-US');

                    if (LOCAL_USE_COMPARE_MODE) {
                        var intTBS = parseInt(TBS.replaceAll(',', ''));
                        var localTBS = parseInt(LOCAL_STATS_STR) + parseInt(LOCAL_STATS_DEF) + parseInt(LOCAL_STATS_DEX) + parseInt(LOCAL_STATS_SPD);
                        var tbs1Ratio = 100 * intTBS / localTBS;

                        var intTbsBalanced = parseInt(TBSBalanced.replaceAll(',', ''));
                        var tbsBalancedRatio = 100 * intTbsBalanced / ((parseInt(LOCAL_SCORE) * parseInt(LOCAL_SCORE)) / 4);

                        var colorTBS = getColorDifference(tbs1Ratio);
                        var colorBalancedTBS = getColorDifference(tbsBalancedRatio);

                        if (divSvgAttackToColor) divSvgAttackToColor.style.fill = colorTBS;

                        divWhereToInject.innerHTML += '<div title = "From the TBS model" style="font-size: 14px; text-align: left; margin-left: 20px;  margin-top:5px">TBS (Model-TBS-) = ' + TBS + '<label style="color:' + colorTBS + '";"> (' + tbs1Ratio.toFixed(0) + '%) </label>' +
                            '<br /> TBS (ModelScore) = ' + TBSBalanced + '<label style="color:' + colorBalancedTBS + '";"> (' + tbsBalancedRatio.toFixed(0) + '%) </label></div>';
                    }
                    else {
                        divWhereToInject.innerHTML += '<div style="font-size: 14px; text-align: left; margin-left: 20px;  margin-top:5px;">TBS_1 = ' + TBS +
                            '<br /> TBS_2 = ' + TBSBalanced + '</div>';
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