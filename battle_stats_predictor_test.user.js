// ==UserScript==
// @name        Battle Stats Predictor
// @description Show battle stats prediction, computed by a third party service
// @version     6.0
// @namespace   tdup.battleStatsPredictor
// @match       https://www.torn.com/profiles.php*
// @match       https://www.torn.com/bringafriend.php*
// @match       https://www.torn.com/halloffame.php*
// @match       https://www.torn.com/index.php?page=people*
// @match       https://www.torn.com/factions.php*
// @match       https://www.torn.com/page.php*
// @match       https://www.torn.com/joblist.php*
// @match       https://www.torn.com/competition.php*
// @match       https://www.torn.com/bounties.php*
// @run-at      document-end
// @grant       GM.xmlHttpRequest
// @grant       GM_setValue
// @grant       GM_getValue
// @grant       GM_info
// @connect     api.torn.com
// @connect     www.lol-manager.com
// @connect     www.tornstats.com
// @author      TDup
// ==/UserScript==

var logVerbose = false;

// Used for identification to the third party + doing torn api call when target stats are not cached yet
let LOCAL_API_KEY = localStorage["tdup.battleStatsPredictor.TornApiKey"];
let LOCAL_API_KEY_IS_VALID = localStorage["tdup.battleStatsPredictor.TornApiKeyValid"] == "true";
let LOCAL_API_KEY_CAN_FETCH_BATTLE_STATS = localStorage["tdup.battleStatsPredictor.TornApiKeyCanFetchBattleStats"] == "true";

// Used to retrieve spies from TornStats.
// Important : THIS IS NOT SENT to the backend, it's loading your TornStats spies into your local cache, and this script will display those spies values instead of predictions.
let LOCAL_USE_TORN_STATS_SPIES = localStorage["tdup.battleStatsPredictor.useTornStatsSpies"] == "true";
let LOCAL_TORN_STATS_API_KEY = localStorage["tdup.battleStatsPredictor.TornStatsApiKey"];

// Used to compare players stats and show if you are weaker/stronger.
// Important : THIS IS NOT SENT to the backend, you can type whatever you want, it'll be used only locally to compare with the predicted stats.
var LOCAL_USE_COMPARE_MODE = localStorage["tdup.battleStatsPredictor.useCompareMode"] == "true";
let LOCAL_SCORE = localStorage["tdup.battleStatsPredictor.comparisonScore"];
let LOCAL_STATS_STR = localStorage["tdup.battleStatsPredictor.comparisonStr"];
let LOCAL_STATS_DEF = localStorage["tdup.battleStatsPredictor.comparisonDef"];
let LOCAL_STATS_SPD = localStorage["tdup.battleStatsPredictor.comparisonSpd"];
let LOCAL_STATS_DEX = localStorage["tdup.battleStatsPredictor.comparisonDex"];
let LOCAL_TBS = localStorage["tdup.battleStatsPredictor.comparisonTbs"];

let LOCAL_PREDICTION_VERSION_ON_SERVER = localStorage["tdup.battleStatsPredictor.PredictionVersionOnServer"];

let LOCAL_SHOW_PREDICTION_DETAILS = localStorage["tdup.battleStatsPredictor.showPredictionDetails"] == "true";
let LOCAL_DATE_SUBSCRIPTION_END = localStorage["tdup.battleStatsPredictor.dateSubscriptionEnd"];

const LOCAL_COLORS = [
    { maxValue: 5, color: '#949494', canModify: true },
    { maxValue: 35, color: '#FFFFFF', canModify: true },
    { maxValue: 75, color: '#73DF5D', canModify: true },
    { maxValue: 125, color: '#47A6FF', canModify: true },
    { maxValue: 400, color: '#FFB30F', canModify: true },
    { maxValue: 10000000000, color: '#FF0000', canModify: false },
];

var FAIL = 0;
var SUCCESS = 1;
var TOO_WEAK = 2;
var TOO_STRONG = 3;
var MODEL_ERROR = 4;

var errorAPIKeyInvalid;
var errorImportBattleStats;
var successImportBattleStats;
var comparisonBattleStatsText;
var scoreStrInput;
var scoreDefInput;
var scoreSpdInput;
var scoreDexInput;
var apiKeyText;
var subscriptionEndText;
var dateSubscriptionEndUtc;
var setBattleStats;
var btnValidateTornStatsAPIKey;
var successValidateTornStatsAPIKey;
var errorValidateTornStatsAPIKey;
var btnImportTornStatsSpies;
var successImportTornStatsSpies;
var errorImportTornStatsSpies;
var mainNode;
var isUsingHonorBar = false;

var TDup_PredictorOptionsMenu;
var TDup_PredictorOptionsTabs;

var isInjected = false;
var ProfileTargetId = -1;
var divWhereToInject;
var svgAttackDivFound = false;
var divSvgAttackToColor;
var dictDivPerPlayer = {};


const PageType = {
    Profile: 'https://www.torn.com/profiles.php',
    RecruitCitizens: 'https://www.torn.com/bringafriend.php',
    HallOfFame: 'https://www.torn.com/halloffame.php',
    IndexPeople: 'https://www.torn.com/index.php?page=people', //TDTODO ??
    Faction: 'https://www.torn.com/factions.php',
    Page: 'https://www.torn.com/page.php',
    Company: 'https://www.torn.com/joblist.php',
    Competition: 'https://www.torn.com/competition.php',
    Bounty: 'https://www.torn.com/bounties.php'
};

var styleToAdd = document.createElement('style');

styleToAdd.innerHTML += '.iconStats {height: 20px; width: 32px; position: relative; text-align: center; font-size: 12px; font-weight:bold; color: black; box-sizing: border-box; border: 1px solid black;line-height: 18px;font-family: initial;}';

//styleToAdd.innerHTML += '.TDup_optionsTabContent {all : initial;}';

//styleToAdd.innerHTML += '.TDup_optionsTabContent * { all: unset;}';

/* Style the tab */
styleToAdd.innerHTML += '.TDup_optionsTab {float: left;border: 1px solid #ccc;background-color: #f1f1f1; width: 150px; height: 300px;}';

/* Style the buttons inside the tab */
styleToAdd.innerHTML += '.TDup_optionsTab button {display: block; background-color: inherit; color: black; padding: 22px 16px; width: 100%; border: none; outline: none; text-align: left; cursor: pointer; transition: 0.3s;font-size: 17px;}';

/* Change background color of buttons on hover */
styleToAdd.innerHTML += '.TDup_optionsTab button:hover button:focus { background-color: #99ccff !important; color: black !important}';

/* Create an active/current "tab button" class */
styleToAdd.innerHTML += '.TDup_optionsTab button.active { background-color: #6699ff !important;}';

/* Style the tab content */
styleToAdd.innerHTML += '.TDup_optionsTabContent { /*float: left;*/  padding: 0px 12px;  border: 1px solid #ccc;  width: 70%;  border-left: none;  height: 300px;  }';

// Get the first script tag
var ref = document.querySelector('script');

// Insert our new styles before the first script tag
ref.parentNode.insertBefore(styleToAdd, ref);

function LogInfo(value) {
    console.log(value);
}

function GetPredictionFromCache(playerId) {
    var key = "tdup.battleStatsPredictor.cache.prediction." + playerId;

    if (localStorage[key] == "[object Object]")
        localStorage.removeItem(key);

    if (localStorage[key] != undefined)
        return JSON.parse(localStorage[key]);

    return undefined;
}

function SetPredictionInCache(playerId, prediction) {
    if (prediction.Result == FAIL || prediction.Result == MODEL_ERROR) {
        return;
    }
    var key = "tdup.battleStatsPredictor.cache.prediction." + playerId;
    localStorage[key] = JSON.stringify(prediction);
}

function SetSpyInCache(playerId, spy) {
    if (spy == undefined) {
        return false;
    }

    let existingSpy = GetSpyFromCache(playerId);
    if (existingSpy != undefined && existingSpy.timestamp >= spy.timestamp) {
        return false;
    }

    var key = "tdup.battleStatsPredictor.cache.spy." + playerId;
    spy.IsSpy = true;
    localStorage[key] = JSON.stringify(spy);
    return true;
}

function GetSpyFromCache(playerId) {
    let key = "tdup.battleStatsPredictor.cache.spy." + playerId;
    let data = localStorage[key];
    if (data == undefined) {
        return undefined;
    }
    return JSON.parse(localStorage[key]);
}

function CleanPredictionsCache() {
    for (key in localStorage) {
        if (key.startsWith('tdup.battleStatsPredictor.cache.prediction.')) {
            localStorage.removeItem(key);
        }
    }
}

function CleanAllPredictorStorage() {
    for (key in localStorage) {
        if (key.startsWith('tdup.battleStatsPredictor.')) {
            localStorage.removeItem(key);
        }
    }
}

function JSONparse(str) {
    try {
        return JSON.parse(str);
    } catch (e) { }
    return null;
}

function IsPage(pageType) {
    return window.location.href.startsWith(pageType);
}

async function GetPlayerFromTornAPI(key, retrieveStats, callback) {
    var urlToUse = "https://api.torn.com/user/?";
    if (retrieveStats)
        urlToUse += "selections=battlestats&";

    urlToUse += "comment=BSPAuth&key=" + key;
    GM.xmlHttpRequest({
        method: "GET",
        url: urlToUse,
        onload: (r) => {

            LOCAL_API_KEY_IS_VALID = false;
            localStorage.setItem("tdup.battleStatsPredictor.TornApiKeyValid", LOCAL_API_KEY_IS_VALID);

            LOCAL_API_KEY_CAN_FETCH_BATTLE_STATS = false;
            localStorage.setItem("tdup.battleStatsPredictor.TornApiKeyCanFetchBattleStats", LOCAL_API_KEY_CAN_FETCH_BATTLE_STATS);

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
                LOCAL_API_KEY_IS_VALID = true;
                localStorage.setItem("tdup.battleStatsPredictor.TornApiKeyValid", LOCAL_API_KEY_IS_VALID);

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

                    LOCAL_API_KEY_CAN_FETCH_BATTLE_STATS = true;
                    localStorage.setItem("tdup.battleStatsPredictor.TornApiKeyCanFetchBattleStats", LOCAL_API_KEY_CAN_FETCH_BATTLE_STATS);
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
    if (value != undefined && value != 0 && value != true) {
        errorImportBattleStats.innerHTML = 'Error while fetching battle stats : ' + value + '.<br /> If you want this to work, you need to use an API key with read access to your battle stats.<br />You can create one by <a href="https://www.torn.com/preferences.php#tab=api?step=addNewKey&title=BattleStatsPredictor&user=basic,personalstats,profile,battlestats" target="_blank">clicking here</a>';
        errorImportBattleStats.style.display = "block";

        if (errorAPIKeyInvalid)
            errorAPIKeyInvalid.style.display = "block";

        return;
    }
    else {

        if (value === true) {
            successImportBattleStats.style.visibility = "visible";
        }
        errorImportBattleStats.style.display = "none";

        if (errorAPIKeyInvalid)
            errorAPIKeyInvalid.style.display = "none";
    }

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

function getColorDifference(ratio) {
    for (var i = 0; i < LOCAL_COLORS.length; ++i) {
        if (ratio < LOCAL_COLORS[i].maxValue) {
            return LOCAL_COLORS[i].color;
        }
    }
    return "#ffc0cb"; //pink
}

function OnProfilePlayerStatsRetrieved(playerId, prediction) {
    if (prediction == undefined) {
        return;
    }

    if (subscriptionEndText != undefined) {
        var dateNow = new Date();
        var offsetInMinute = dateNow.getTimezoneOffset();
        var dateSubscriptionEnd = new Date(LOCAL_DATE_SUBSCRIPTION_END);
        dateSubscriptionEnd.setMinutes(dateSubscriptionEnd.getMinutes() - offsetInMinute);
        var time_difference = dateSubscriptionEnd - dateNow;
        if (time_difference < 0) {
            CleanPredictionsCache();
            subscriptionEndText.innerHTML = '<div style="color:#1E88E5">WARNING - Your subscription has expired.<br />You can renew it for 1xan/15days (send to <a style="display:inline-block;" href="https://www.torn.com/profiles.php?XID=2660552">TDup[2660552]</a> with msg bsp)</div>';
        }
        else {
            var days_difference = parseInt(time_difference / (1000 * 60 * 60 * 24));
            var hours_difference = parseInt(time_difference / (1000 * 60 * 60));
            hours_difference %= 24;
            var minutes_difference = parseInt(time_difference / (1000 * 60));
            minutes_difference %= 60;

            subscriptionEndText.innerHTML = '<div style="color:#1E88E5">Your subscription ends in '
                + parseInt(days_difference) + ' day' + (days_difference > 1 ? 's' : '') + ', '
                + parseInt(hours_difference) + ' hour' + (hours_difference > 1 ? 's' : '') + ', '
                + parseInt(minutes_difference) + ' minute' + (minutes_difference > 1 ? 's' : '') + '.<br />You can extend it for 1xan/15days (send to <a style="display:inline-block;" href="https://www.torn.com/profiles.php?XID=2660552">TDup[2660552]</a> with msg "bsp")</div>';
        }
    }


    if (prediction.IsSpy === true) {
        var localTBS = parseInt(LOCAL_STATS_STR) + parseInt(LOCAL_STATS_DEF) + parseInt(LOCAL_STATS_DEX) + parseInt(LOCAL_STATS_SPD);
        var tbsRatio = 100 * prediction.total / localTBS;
        var colorComparedToUs = getColorDifference(tbsRatio);

        divWhereToInject.innerHTML += '<div style="font-size: 18px; text-align: center; margin-top:7px"><img src="https://game-icons.net/icons/000000/transparent/1x1/lorc/magnifying-glass.png" width="18" height="18" style="margin-right:5px;"/>' + FormatBattleStats(prediction.total) + ' <label style = "color:' + colorComparedToUs + '"; "> (' + tbsRatio.toFixed(0) + '%) </label></div >';
        return;
    }

    switch (prediction.Result) {
        case MODEL_ERROR:
        case FAIL:
            divWhereToInject.innerHTML += '<div style="font-size: 14px; text-align: left; margin-left: 20px;  margin-top:5px;">Error : ' + prediction.Reason + '</div>';
            return;
        case TOO_WEAK:
        case TOO_STRONG:
        case SUCCESS:
            {
                let TBSBalanced = prediction.TBS_Balanced.toLocaleString('en-US');
                let TBS = prediction.TBS.toLocaleString('en-US');
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

                    if (prediction.Result == TOO_STRONG) {
                        divWhereToInject.innerHTML += '<div style="font-size: 18px; text-align: center; margin-top:7px">Too strong to give a proper estimation</div >';
                    } else if (prediction.Result == TOO_WEAK) {
                        divWhereToInject.innerHTML += '<div style="font-size: 18px; text-align: center; margin-top:7px">Too weak to give a proper estimation</div >';
                    }
                    else {
                        divWhereToInject.innerHTML += '<div style="font-size: 18px; text-align: center; margin-top:7px"><img src="https://game-icons.net/icons/000000/transparent/1x1/delapouite/weight-lifting-up.png" width="18" height="18" style="margin-right:5px;"/>' + FormatBattleStats(averageModelTBS) + ' <label style = "color:' + colorComparedToUs + '"; "> (' + ratioComparedToUs.toFixed(0) + '%) </label></div >';
                    }

                    if (LOCAL_SHOW_PREDICTION_DETAILS) {
                        divWhereToInject.innerHTML += '<div style="font-size: 10px; text-align: left; margin-top:2px; float:left;">TBS(TBS) = ' + intTBS.toLocaleString('en-US') + '<label style="color:' + colorTBS + '";"> (' + tbs1Ratio.toFixed(0) + '%) </label></div>';
                        divWhereToInject.innerHTML += '<div style="font-size: 10px; text-align: right; margin-top:2px;float:right;">TBS(Score) = ' + intTbsBalanced.toLocaleString('en-US') + '<label style="color:' + colorBalancedTBS + '";"> (' + tbsBalancedRatio.toFixed(0) + '%) </label></div>';
                        if (prediction.fromCache) {
                            divWhereToInject.innerHTML += '<div style="font-size: 10px; text-align: center;"><img src="https://cdn1.iconfinder.com/data/icons/database-1-1/100/database-20-128.png" title="' + prediction.PredictionDate + '"  width="12" height="12"/></div>';
                        }
                    }
                }
                else {

                    if (prediction.Result == TOO_STRONG) {
                        divWhereToInject.innerHTML += '<div style="font-size: 18px; text-align: center; margin-top:7px">Too strong to give a proper estimation</div >';
                    } else if (prediction.Result == TOO_WEAK) {
                        divWhereToInject.innerHTML += '<div style="font-size: 18px; text-align: center; margin-top:7px">Too weak to give a proper estimation</div >';
                    }
                    else {
                        divWhereToInject.innerHTML += '<div style="font-size: 18px; text-align: center; margin-top:7px"><img src="https://game-icons.net/icons/000000/transparent/1x1/delapouite/weight-lifting-up.png" width="18" height="18" style="margin-right:5px;"/>' + FormatBattleStats(averageModelTBS) + '</div >';
                    }

                    if (LOCAL_SHOW_PREDICTION_DETAILS) {
                        divWhereToInject.innerHTML += '<div style="font-size: 10px; text-align: left; margin-top:2px; float:left;">TBS(TBS) = ' + intTBS.toLocaleString('en-US') + '</div>';
                        divWhereToInject.innerHTML += '<div style="font-size: 10px; text-align: right; margin-top:2px;float:right;">TBS(Score) = ' + intTbsBalanced.toLocaleString('en-US') + '</div>';
                    }
                }
            }
            break;
    }
}

function FormatBattleStats(number) {
    var localized = number.toLocaleString('en-US');
    var myArray = localized.split(",");
    if (myArray.length < 1) {
        return 'ERROR';
    }

    var toReturn = myArray[0];
    if (toReturn < 10) {
        if (parseInt(myArray[1][0]) != 0) {
            toReturn += '.' + myArray[1][0];
        }
    }
    switch (myArray.length) {
        case 2:
            toReturn += "k";
            break;
        case 3:
            toReturn += "m";
            break;
        case 4:
            toReturn += "b";
            break;
        case 5:
            toReturn += "t";
            break;
    }

    return toReturn;
}

async function GetPredictionForPlayer(targetId, callback) {
    if (targetId == undefined || targetId < 1) {
        return;
    }

    let targetSpy = GetSpyFromCache(targetId);
    if (targetSpy != undefined) {
        let spyDateConsideredTooOld = new Date();
        spyDateConsideredTooOld.setDate(spyDateConsideredTooOld.getDate() - 30); // 30 days old spies are not displayed anymore, and we switch back to predictions
        let spyDate = new Date(targetSpy.timestamp * 1000);
        if (spyDate > spyDateConsideredTooOld) {
            callback(targetId, targetSpy);
            return;
        }
    }

    if (LOCAL_DATE_SUBSCRIPTION_END != undefined) {
        var prediction = GetPredictionFromCache(targetId);
        if (prediction != undefined) {
            var isPredictionValid = true;
            var expirationDate = new Date();
            expirationDate.setDate(expirationDate.getDate() - 1);
            var predictionDate = new Date(prediction.PredictionDate);
            if ((predictionDate < expirationDate) || (prediction.Version != parseInt(LOCAL_PREDICTION_VERSION_ON_SERVER))) {
                var key = "tdup.battleStatsPredictor.cache.prediction." + targetId;
                localStorage.removeItem(key);
                isPredictionValid = false;
            }

            if (isPredictionValid) {
                prediction.fromCache = true;
                callback(targetId, prediction);
                LogInfo("Prediction for target" + targetId + " found in the cache");
                return;
            }
        }
    }

    LogInfo("Prediction for target" + targetId + " not found in the cache, asking server..");
    const newPrediction = await FetchScoreAndTBS(targetId);
    LogInfo("Prediction for target" + targetId + " not found in the cache, value retrieved");
    if (newPrediction != undefined) {
        SetPredictionInCache(targetId, newPrediction);

        var subscriptionEnd = new Date(newPrediction.SubscriptionEnd);
        LOCAL_DATE_SUBSCRIPTION_END = subscriptionEnd;
        localStorage.setItem("tdup.battleStatsPredictor.dateSubscriptionEnd", LOCAL_DATE_SUBSCRIPTION_END);
    }
    callback(targetId, newPrediction);
}

function FetchServerVersion() {
    return new Promise((resolve, reject) => {
        GM.xmlHttpRequest({
            method: 'GET',
            url: `http://www.lol-manager.com/api/battlestats/`,
            headers: {
                'Content-Type': 'application/json'
            },
            onload: (response) => {
                try {
                    if (parseInt(response.responseText)) {
                        var serverVersion = parseInt(response.responseText);
                        var localVersion = parseInt(LOCAL_PREDICTION_VERSION_ON_SERVER);
                        if (serverVersion != localVersion) {
                            LogInfo("Server changed prediction model version, from " + localVersion + " to " + serverVersion);
                            LOCAL_PREDICTION_VERSION_ON_SERVER = serverVersion;
                            localStorage.setItem("tdup.battleStatsPredictor.PredictionVersionOnServer", LOCAL_PREDICTION_VERSION_ON_SERVER);
                        }
                    }
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

function FetchScoreAndTBS(targetId) {
    return new Promise((resolve, reject) => {
        GM.xmlHttpRequest({
            method: 'GET',
            url: `http://www.lol-manager.com/api/battlestats/${LOCAL_API_KEY}/${targetId}`, //var version = GM_info.script.version;
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

function VerifyTornStatsAPIKey(apiKey) {
    return new Promise((resolve, reject) => {
        GM.xmlHttpRequest({
            method: 'GET',
            url: `https://www.tornstats.com/api/v2/${apiKey}`,
            headers: {
                'Content-Type': 'application/json'
            },
            onload: (response) => {
                try {
                    btnValidateTornStatsAPIKey.disabled = false;

                    var result = JSON.parse(response.responseText);
                    if (result == undefined) {
                        errorValidateTornStatsAPIKey.style.visibility = "visible";
                        errorValidateTornStatsAPIKey.style.display = "block";
                        errorValidateTornStatsAPIKey.innerHTML = "Error while calling TornStats";
                        successValidateTornStatsAPIKey.style.visibility = "hidden";
                        return;
                    }
                    if (result.status === false) {
                        errorValidateTornStatsAPIKey.style.visibility = "visible";
                        errorValidateTornStatsAPIKey.style.display = "block";
                        errorValidateTornStatsAPIKey.innerHTML = result.message;
                        successValidateTornStatsAPIKey.style.visibility = "hidden";
                        return;
                    }

                    errorValidateTornStatsAPIKey.style.visibility = "hidden";
                    successValidateTornStatsAPIKey.style.visibility = "visible";
                    successValidateTornStatsAPIKey.style.display = "block";
                    successValidateTornStatsAPIKey.innerHTML = "Success!";

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

function FetchFactionSpiesFromTornStats(factionId, successElem, failedElem) {
    return new Promise((resolve, reject) => {
        GM.xmlHttpRequest({
            method: 'GET',
            url: `https://www.tornstats.com/api/v2/${LOCAL_TORN_STATS_API_KEY}/spy/faction/${factionId}`,
            headers: {
                'Content-Type': 'application/json'
            },
            onload: (response) => {
                try {
                    btnImportTornStatsSpies.disabled = false;
                    var results = JSON.parse(response.responseText);

                    if (results == undefined) {
                        failedElem.style.visibility = "visible";
                        failedElem.style.display = "block";
                        failedElem.innerHTML = "Error while calling TornStats";
                        successElem.style.visibility = "hidden";
                        return;
                    }
                    if (results.status === false) {
                        failedElem.style.visibility = "visible";
                        failedElem.style.display = "block";
                        failedElem.innerHTML = results.message;
                        successElem.style.visibility = "hidden";
                        return;
                    }

                    let membersCount = 0;
                    let newSpiesAdded = 0;
                    for (var key in results.faction.members) {
                        let factionMember = results.faction.members[key];
                        if (factionMember.spy == undefined) {
                            continue;
                        }
                        membersCount++;
                        let success = SetSpyInCache(factionMember.id, factionMember.spy);
                        if (success) {
                            newSpiesAdded++;
                        }
                    }

                    failedElem.style.visibility = "hidden";
                    successElem.style.visibility = "visible";
                    successElem.style.display = "block";
                    successElem.innerHTML = "Success! " + membersCount + " spies fetched from TornStats. " + newSpiesAdded + " new spies added";
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

function OnPlayerStatsRetrievedForGrid(targetId, prediction) {
    var urlAttack = "https://www.torn.com/loader2.php?sid=getInAttack&user2ID=" + targetId;

    if (prediction.IsSpy === true) {
        var localTBS = parseInt(LOCAL_STATS_STR) + parseInt(LOCAL_STATS_DEF) + parseInt(LOCAL_STATS_DEX) + parseInt(LOCAL_STATS_SPD);
        var tbsRatio = 100 * prediction.total / localTBS;
        var colorComparedToUs = getColorDifference(tbsRatio);

        if (isUsingHonorBar == true)
            toInject = '<a href="' + urlAttack + '" target="_blank"><div style="position: absolute;z-index: 100;"><div class="iconStats" style="background:' + colorComparedToUs + '">' + FormatBattleStats(prediction.total) + '</div></div></a>';
        else
            toInject = '<a href="' + urlAttack + '" target="_blank"><div style="display: inline-block; margin-right:5px;"><div class="iconStats" style="background:' + colorComparedToUs + '">' + FormatBattleStats(prediction.total) + '</div></div></a>';
        //  toInject = '<div style="display: inline-block; margin-right:5px;"><a href="' + urlAttack + '" target="_blank"><img title=' + FormatBattleStats(prediction.total) + ' style="background-color:' + colorComparedToUs + ';" width="20" height="20" src="https://game-icons.net/icons/000000/transparent/1x1/lorc/magnifying-glass.png" /></a></div>';

        //if (isUsingHonorBar == true)
        //    toInject = '<div style="position: absolute;z-index: 100;background-color:' + colorComparedToUs +'; width:20px; height:20px;"><a href="' + urlAttack + '" target="_blank">' + FormatBattleStats(prediction.total) +'</a></div>';
        //else
        //    toInject = '<div style="display: inline-block; margin-right:5px;"><a href="' + urlAttack + '" target="_blank"><img title=' + FormatBattleStats(prediction.total) + ' style="background-color:' + colorComparedToUs + ';" width="20" height="20" src="https://game-icons.net/icons/000000/transparent/1x1/lorc/magnifying-glass.png" /></a></div>';


        //if (isUsingHonorBar == true)
        //    toInject = '<div style="position: absolute;z-index: 100;"><a href="' + urlAttack + '" target="_blank"><img title=' + FormatBattleStats(prediction.total) + ' style="background-color:' + colorComparedToUs + ';" width="20" height="20" src="https://game-icons.net/icons/000000/transparent/1x1/lorc/magnifying-glass.png" /></a></div>';
        //else
        //    toInject = '<div style="display: inline-block; margin-right:5px;"><a href="' + urlAttack + '" target="_blank"><img title=' + FormatBattleStats(prediction.total) + ' style="background-color:' + colorComparedToUs + ';" width="20" height="20" src="https://game-icons.net/icons/000000/transparent/1x1/lorc/magnifying-glass.png" /></a></div>';

        for (var i = 0; i < dictDivPerPlayer[targetId].length; i++) {
            if (dictDivPerPlayer[targetId][i].innerHTML.startsWith('<a href="https://www.torn.com/loader2.php?sid=getInAttack')) {
                continue;
            }
            dictDivPerPlayer[targetId][i].innerHTML = toInject + dictDivPerPlayer[targetId][i].innerHTML;
        }

        return;
    }


    let result = prediction.Result;
    switch (result) {
        case FAIL:
        case MODEL_ERROR:
            var toInject = '<div style="position: absolute;z-index: 100;"><img style="border-radius: 50%;" width="16" height="16" src="https://www.freeiconspng.com/uploads/sign-red-error-icon-1.png" /></div>';
            for (var i = 0; i < dictDivPerPlayer[targetId].length; i++) {
                dictDivPerPlayer[targetId][i].innerHTML = toInject + dictDivPerPlayer[targetId][i].innerHTML;
            }
            return;
        case TOO_WEAK:
        case TOO_STRONG:
        case SUCCESS:
            {
                if (LOCAL_USE_COMPARE_MODE) {
                    let TBS = prediction.TBS.toLocaleString('en-US');
                    let TBSBalanced = prediction.TBS_Balanced.toLocaleString('en-US');

                    var intTBS = parseInt(TBS.replaceAll(',', ''));
                    var intTBSBalanced = parseInt(TBSBalanced.replaceAll(',', ''));

                    var localTBS = parseInt(LOCAL_STATS_STR) + parseInt(LOCAL_STATS_DEF) + parseInt(LOCAL_STATS_DEX) + parseInt(LOCAL_STATS_SPD);

                    var predictedStats = (intTBS + intTBSBalanced) / 2;
                    if (prediction.Result == TOO_STRONG) {
                        predictedStats = intTBS;
                    }

                    var ratioComparedToUs = 100 * predictedStats / localTBS;
                    var colorTBS = getColorDifference(ratioComparedToUs);

                    var toInject = "";
                    if (isUsingHonorBar == true)
                        toInject = '<a href="' + urlAttack + '" target="_blank"><div style="position: absolute;z-index: 100;"><div class="iconStats" style="background:' + colorTBS + '">' + FormatBattleStats(predictedStats) + '</div></div></a>';
                    //toInject = '<div style="position: absolute;z-index: 100;"><a href="' + urlAttack + '" target="_blank"><img title=' + FormatBattleStats(predictedStats) + ' style="background-color:' + colorTBS + ';" width="20" height="20" src="https://cdn1.iconfinder.com/data/icons/guns-3/512/police-gun-pistol-weapon-512.png" /></a></div>';
                    else
                        toInject = '<div style="display: inline-block; margin-right:5px;"><a href="' + urlAttack + '" target="_blank"><img title=' + FormatBattleStats(predictedStats) + ' style="background-color:' + colorTBS + ';" width="20" height="20" src="https://cdn1.iconfinder.com/data/icons/guns-3/512/police-gun-pistol-weapon-512.png" /></a></div>';

                    for (var i = 0; i < dictDivPerPlayer[targetId].length; i++) {
                        if (dictDivPerPlayer[targetId][i].innerHTML.includes("iconStats")) {
                            continue;
                        }
                        dictDivPerPlayer[targetId][i].innerHTML = toInject + dictDivPerPlayer[targetId][i].innerHTML;
                    }
                }
                return;
            }
    }
}

function openOptionsTab(evt, optionsTabName) {
    var i, tabcontent, tablinks;
    tabcontent = document.getElementsByClassName("TDup_optionsTabContent");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }
    tablinks = document.getElementsByClassName("TDup_tablinks");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }
    document.getElementById(optionsTabName).style.display = "block";
    evt.currentTarget.className += " active";
}

function BuildOptionMenu(tabs, menu, name, isOpenAtStart = false) {
    // Adding the button in the tabs
    let TabEntryBtn = document.createElement("button");
    TabEntryBtn.className = "TDup_tablinks";
    if (isOpenAtStart) TabEntryBtn.id = "TDup_tablinks_defaultOpen";
    TabEntryBtn.innerHTML = name;
    TabEntryBtn.addEventListener("click", function (evt) {
        openOptionsTab(evt, "TDup_optionsTabContent_" + name);
    });

    tabs.appendChild(TabEntryBtn);

    // Adding the corresponding div
    let TabContent = document.createElement("div");
    TabContent.className = "TDup_optionsTabContent";
    TabContent.id = "TDup_optionsTabContent_" + name;
    menu.appendChild(TabContent);

    return TabContent;
}

function BuildOptionMenu_Global(tabs, menu) {
    let contentDiv = BuildOptionMenu(tabs, menu, "Global", true);

    // Global option menu content:
    // Global API Key
    let apiKeyNode = document.createElement("div");
    let apiKeyText = document.createElement("p");
    apiKeyText.innerHTML = "API Key"; //used to retrieve target information (xanax, refills etc) to predict their stats
    apiKeyNode.appendChild(apiKeyText);

    let apiKeyInput = document.createElement("input");
    if (LOCAL_API_KEY) apiKeyInput.value = LOCAL_API_KEY;
    apiKeyNode.appendChild(apiKeyInput);

    let btnValidateTornStatsAPIKey = document.createElement("input");
    btnValidateTornStatsAPIKey.type = "button";
    btnValidateTornStatsAPIKey.value = "Validate";
    apiKeyNode.appendChild(btnValidateTornStatsAPIKey);

    let apiRegister = document.createElement("span");
    apiRegister.innerHTML = '<a href="https://www.torn.com/preferences.php#tab=api?step=addNewKey&title=BattleStatsPredictor&user=basic,personalstats,profile" target="_blank">Create a basic key</a>';
    //apiRegister.innerHTML += '<a href="https://www.torn.com/preferences.php#tab=api?step=addNewKey&title=BattleStatsPredictor&user=basic,personalstats,profile,battlestats" target="_blank">Create a key with access to your battle stats</a>(Those are not transmited to our server)';
    apiKeyNode.appendChild(apiRegister);
    contentDiv.appendChild(apiKeyNode);

    // Subscription info
    let subscriptionNode = document.createElement("div");
    let subscriptionText = document.createElement("p");
    subscriptionText.innerHTML = "State of your subscription";

    subscriptionEndText = document.createElement("div");
    subscriptionEndText.innerHTML = "Your subscription has expired";
    subscriptionNode.appendChild(subscriptionText);
    subscriptionNode.appendChild(subscriptionEndText);

    contentDiv.appendChild(subscriptionNode);

    // Pages where it's enabled
    //BuildOptionsCheckboxPageWhereItsEnabled(contentDiv, PageType.Profile);
}

function BuildOptionMenu_StatsDisplay(tabs, menu) {
    let contentDiv = BuildOptionMenu(tabs, menu, "Stats Display");

    // COMPARISON STATS PART
    let comparisonBattleStatsNode = document.createElement("div");
    contentDiv.appendChild(comparisonBattleStatsNode);

    var cell, raw, table;
    table = document.createElement('table');

    setBattleStats = document.createElement("input");
    setBattleStats.style.marginTop = '5px';
    setBattleStats.style.marginBottom = '5px';
    setBattleStats.type = "button";
    setBattleStats.value = "Import my battle stats";
    comparisonBattleStatsNode.appendChild(setBattleStats);

    successImportBattleStats = document.createElement("label");
    successImportBattleStats.innerHTML = 'Battle stats updated!';
    successImportBattleStats.style.color = '#1E88E5';
    successImportBattleStats.style.visibility = "hidden";
    comparisonBattleStatsNode.appendChild(successImportBattleStats);

    errorImportBattleStats = document.createElement("label");
    errorImportBattleStats.innerHTML = 'Error while fetching battle stats';
    errorImportBattleStats.style.backgroundColor = 'red';
    errorImportBattleStats.style.display = "none";
    comparisonBattleStatsNode.appendChild(errorImportBattleStats);

    comparisonBattleStatsNode.appendChild(table);

    // ************************** DEX ***********************
    let comparisonDex = document.createElement("label");
    comparisonDex.innerHTML = '<div style="text-align: right; margin-right:10px;">Dex&nbsp</div>';
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
    comparisonSpd.innerHTML = '<div style="text-align: right; margin-right:10px;">Spd&nbsp</div>';
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
    comparisonDef.innerHTML = '<div style="text-align: right; margin-right:10px;">Def&nbsp</div>';
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
    comparisonStr.innerHTML = '<div style="text-align: right; margin-right:10px;">Str&nbsp</div>';
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

    comparisonBattleStatsText = document.createElement("span");
    if (LOCAL_TBS && LOCAL_SCORE) {
        comparisonBattleStatsText.innerHTML = "<br/> TBS = " + parseInt(LOCAL_TBS).toLocaleString('en-US') + " | Battle Score = " + parseInt(LOCAL_SCORE).toLocaleString('en-US'); + "<br/><br/>";
    }
    else {
        comparisonBattleStatsText.innerHTML = "<br/><br/><br/>";
    }

    comparisonBattleStatsNode.appendChild(comparisonBattleStatsText);

    let colorSettingsNode = document.createElement("div");

    function AddColorPanel(document, colorSettingsNode, colorItem, id) {
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
        var color = localStorage["tdup.battleStatsPredictor.colorSettings_color_v5_" + i];
        if (color != undefined) {
            LOCAL_COLORS[i].color = color;
        }
        var maxvalue = localStorage["tdup.battleStatsPredictor.colorSettings_maxValue_v5_" + i];
        if (maxvalue != undefined) {
            LOCAL_COLORS[i].maxValue = parseInt(maxvalue);
        }
        AddColorPanel(document, colorSettingsNode, LOCAL_COLORS[i]);
    }

    contentDiv.appendChild(colorSettingsNode);
}

function BuildOptionMenu_Pages(tabs, menu) {
    let contentDiv = BuildOptionMenu(tabs, menu, "Pages");

    // Pages option menu content:
    let TabContent_Content = document.createElement("p");
    TabContent_Content.innerHTML = "Page settings here";
    contentDiv.appendChild(TabContent_Content);
}

function BuildOptionMenu_TornStats(tabs, menu) {
    let contentDiv = BuildOptionMenu(tabs, menu, "TornStats");

    let tornStatsCheckBoxNode = document.createElement("div");

    let checkboxTornStats = document.createElement('input');
    checkboxTornStats.type = "checkbox";
    checkboxTornStats.name = "name";
    checkboxTornStats.value = "value";
    checkboxTornStats.id = "id";
    checkboxTornStats.checked = LOCAL_USE_TORN_STATS_SPIES;

    checkboxTornStats.addEventListener("change", () => {
        LOCAL_USE_TORN_STATS_SPIES = !LOCAL_USE_TORN_STATS_SPIES;
        tornStatsNode.style.display = LOCAL_USE_TORN_STATS_SPIES ? "block" : "none";
        localStorage.setItem("tdup.battleStatsPredictor.useTornStatsSpies", LOCAL_USE_TORN_STATS_SPIES);
    });

    var tornStatsCheckboxLabel = document.createElement('label')
    tornStatsCheckboxLabel.htmlFor = "id";
    tornStatsCheckboxLabel.appendChild(document.createTextNode('Use TornStats spies'));
    tornStatsCheckBoxNode.appendChild(tornStatsCheckboxLabel);

    tornStatsCheckBoxNode.appendChild(checkboxTornStats);
    contentDiv.appendChild(tornStatsCheckBoxNode);

    // TornStats spies
    let tornStatsNode = document.createElement("div");

    let tornStatsAPIKeyLabel = document.createElement("label");
    tornStatsAPIKeyLabel.innerHTML = 'TornStats API Key';

    let tornStatsAPIKeyInput = document.createElement("input");
    if (LOCAL_TORN_STATS_API_KEY) {
        tornStatsAPIKeyInput.value = LOCAL_TORN_STATS_API_KEY;
    }

    btnValidateTornStatsAPIKey = document.createElement("input");
    btnValidateTornStatsAPIKey.style.marginTop = '5px';
    btnValidateTornStatsAPIKey.style.marginBottom = '5px';
    btnValidateTornStatsAPIKey.type = "button";
    btnValidateTornStatsAPIKey.value = "Validate";

    successValidateTornStatsAPIKey = document.createElement("label");
    successValidateTornStatsAPIKey.innerHTML = 'TornStats API Key verified';
    successValidateTornStatsAPIKey.style.color = '#1E88E5';
    successValidateTornStatsAPIKey.style.visibility = "hidden";

    errorValidateTornStatsAPIKey = document.createElement("label");
    errorValidateTornStatsAPIKey.innerHTML = 'Error while verifying TornStats API Key';
    errorValidateTornStatsAPIKey.style.backgroundColor = 'red';
    errorValidateTornStatsAPIKey.style.display = "none";

    let tornStatsApiKeyDiv = document.createElement("div");
    tornStatsApiKeyDiv.appendChild(tornStatsAPIKeyLabel);
    tornStatsApiKeyDiv.appendChild(tornStatsAPIKeyInput);
    tornStatsApiKeyDiv.appendChild(btnValidateTornStatsAPIKey);
    tornStatsApiKeyDiv.appendChild(successValidateTornStatsAPIKey);
    tornStatsApiKeyDiv.appendChild(errorValidateTornStatsAPIKey);
    tornStatsNode.appendChild(tornStatsApiKeyDiv);

    btnValidateTornStatsAPIKey.addEventListener("click", () => {
        LOCAL_TORN_STATS_API_KEY = tornStatsAPIKeyInput.value;
        localStorage.setItem("tdup.battleStatsPredictor.TornStatsApiKey", LOCAL_TORN_STATS_API_KEY);
        btnValidateTornStatsAPIKey.disabled = true;
        VerifyTornStatsAPIKey(tornStatsAPIKeyInput.value);
    });

    let importTornStatsSpiesFaction = document.createElement("label");
    importTornStatsSpiesFaction.innerHTML = 'Faction Id';

    let factionIdToImportSpiesFrom = document.createElement("input");
    factionIdToImportSpiesFrom.type = 'number';

    btnImportTornStatsSpies = document.createElement("input");
    btnImportTornStatsSpies.style.marginTop = '5px';
    btnImportTornStatsSpies.style.marginBottom = '5px';
    btnImportTornStatsSpies.type = "button";
    btnImportTornStatsSpies.value = "Import faction spies";

    successImportTornStatsSpies = document.createElement("label");
    successImportTornStatsSpies.innerHTML = 'Spies imported updated!';
    successImportTornStatsSpies.style.color = '#1E88E5';
    successImportTornStatsSpies.style.visibility = "hidden";

    errorImportTornStatsSpies = document.createElement("label");
    errorImportTornStatsSpies.innerHTML = 'Error while fetching spies from TornStats';
    errorImportTornStatsSpies.style.backgroundColor = 'red';
    errorImportTornStatsSpies.style.display = "none";

    btnImportTornStatsSpies.addEventListener("click", () => {
        btnImportTornStatsSpies.disabled = true;
        FetchFactionSpiesFromTornStats(parseInt(factionIdToImportSpiesFrom.value), successImportTornStatsSpies, errorImportTornStatsSpies);
    });

    let tornStatsImportDiv = document.createElement("div");
    tornStatsImportDiv.appendChild(importTornStatsSpiesFaction);
    tornStatsImportDiv.appendChild(factionIdToImportSpiesFrom);
    tornStatsImportDiv.appendChild(btnImportTornStatsSpies);
    tornStatsImportDiv.appendChild(successImportTornStatsSpies);
    tornStatsImportDiv.appendChild(errorImportTornStatsSpies);
    tornStatsNode.appendChild(tornStatsImportDiv);

    contentDiv.appendChild(tornStatsNode);
}

function BuildOptionMenu_Debug(tabs, menu) {
    let contentDiv = BuildOptionMenu(tabs, menu, "Debug");

    // USE SHOW PREDICTION DETAILS
    let PredictionDetailsBoxNode = document.createElement("div");
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
    checkboxPredictionDetailsLabel.appendChild(document.createTextNode('Show prediction details'));
    PredictionDetailsBoxNode.appendChild(checkboxPredictionDetailsLabel);
    PredictionDetailsBoxNode.appendChild(checkboxPredictionDetails);
    contentDiv.appendChild(PredictionDetailsBoxNode);


    var buttonClearLocalCache = document.createElement("input");
    buttonClearLocalCache.style.marginTop = '5px';
    buttonClearLocalCache.style.marginBottom = '5px';
    buttonClearLocalCache.type = "button";
    buttonClearLocalCache.value = "Clear predictor local storage";
    buttonClearLocalCache.style.display = (LOCAL_API_KEY_IS_VALID) ? "block" : "none";

    buttonClearLocalCache.addEventListener("click", () => {
        buttonClearLocalCache.disabled = true;
        if (confirm("BSP - IMPORTANT \r\n \r\nAre you sure you want to clear BSP keys, stats, settings, spies and predictions from your local cache? \r\n \r\nIt will only impact this script: you will have to do the setup again (setup keys, import spies etc)") == true) {
            CleanAllPredictorStorage();
        }
        buttonClearLocalCache.disabled = false;
    });

    contentDiv.appendChild(buttonClearLocalCache);
}

function BuildOptionMenu_Infos(tabs, menu) {
    let contentDiv = BuildOptionMenu(tabs, menu, "Infos");

    // TornStats option menu content:
    let TabContent_Content = document.createElement("p");
    TabContent_Content.innerHTML = "Script version : " + GM_info.script.version;
    contentDiv.appendChild(TabContent_Content);

    let DiscordLink = document.createElement("p");
    DiscordLink.innerHTML = 'Give feedback, report bugs or just come to say hi on the <a href="https://discord.gg/zgrVX5j6MQ">Discord</a>';
    contentDiv.appendChild(DiscordLink);
}

function BuildSettingsMenu(node) {

    TDup_PredictorOptionsMenu = document.createElement("div");
    TDup_PredictorOptionsTabs = document.createElement("div");
    TDup_PredictorOptionsTabs.className = "TDup_optionsTab";

    TDup_PredictorOptionsMenu.appendChild(TDup_PredictorOptionsTabs);

    BuildOptionMenu_Global(TDup_PredictorOptionsTabs, TDup_PredictorOptionsMenu, true);
    BuildOptionMenu_StatsDisplay(TDup_PredictorOptionsTabs, TDup_PredictorOptionsMenu);
    BuildOptionMenu_Pages(TDup_PredictorOptionsTabs, TDup_PredictorOptionsMenu);
    BuildOptionMenu_TornStats(TDup_PredictorOptionsTabs, TDup_PredictorOptionsMenu);
    BuildOptionMenu_Debug(TDup_PredictorOptionsTabs, TDup_PredictorOptionsMenu);
    BuildOptionMenu_Infos(TDup_PredictorOptionsTabs, TDup_PredictorOptionsMenu);

    node.appendChild(TDup_PredictorOptionsMenu);

    TDup_PredictorOptionsMenu.style.display = "none";

    // Get the element with id="defaultOpen" and click on it
    document.getElementById("TDup_tablinks_defaultOpen").click();
}

function InjectOptionMenu(node) {
    if (!node) return;

    mainNode = node;
    var topPageLinksList = node.querySelector("#top-page-links-list");
    if (topPageLinksList == undefined)
        return;

    node.style.position = "relative";
    BuildSettingsMenu(node);

    let configPanelSave = document.createElement("input");
    configPanelSave.type = "button";
    configPanelSave.value = "Save and reload";

    let buttonsNode = document.createElement("div");
    buttonsNode.appendChild(configPanelSave);

    function OnAPIKeyValidationCallback(r) {
        if (r === true) {
            // apiKeyNode.style.display = "none";
            comparisonBattleStatsNode.style.display = "none";
            tornStatsNode.style.display = "none";
            colorSettingsNode.style.display = "none";
            buttonsNode.style.display = "none";
            compareCheckBoxNode.style.display = "none";
            tornStatsCheckBoxNode.style.display = "none";
            //subscriptionNode.style.display = "none";
        }
        else {
            //apiKeyNode.style.display = "block";
            compareCheckBoxNode.style.display = "block";
            tornStatsCheckBoxNode.style.display = "block";
            //subscriptionNode.style.display = "block";
            apiKeyText.innerHTML = `${r}: `;
        }

        location.reload();
    }

    setBattleStats.addEventListener("click", () => {
        if (errorAPIKeyInvalid)
            errorAPIKeyInvalid.style.display = "none";

        errorImportBattleStats.style.display = "none";
        successImportBattleStats.style.visibility = "hidden";
        LOCAL_API_KEY = apiKeyInput.value;
        GetPlayerFromTornAPI(apiKeyInput.value, true, UpdateLocalScore);
        setBattleStats.disabled = true;
    });

    configPanelSave.addEventListener("click", () => {
        if (errorAPIKeyInvalid)
            errorAPIKeyInvalid.style.display = "none";

        errorImportBattleStats.style.display = "none";
        apiKeyText.innerHTML = "Checking key and saving data";

        LOCAL_API_KEY = apiKeyInput.value;
        localStorage.setItem("tdup.battleStatsPredictor.TornApiKey", LOCAL_API_KEY);

        GetPlayerFromTornAPI(apiKeyInput.value, false, OnAPIKeyValidationCallback);

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
            localStorage.setItem("tdup.battleStatsPredictor.colorSettings_color_v5_" + i, LOCAL_COLORS[i].color);

            LOCAL_COLORS[i].maxValue = LOCAL_COLORS[i].inputNumber.value;
            localStorage.setItem("tdup.battleStatsPredictor.colorSettings_maxValue_v5_" + i, LOCAL_COLORS[i].maxValue);
        }

        //location.reload();
        //return false;
    });

    let btnOpenSettings = document.createElement("a");
    btnOpenSettings.className = "t-clear h c-pointer  line-h24 right ";
    btnOpenSettings.innerHTML = '<i class="fa fa-cog" aria-hidden="true"></i><span> Update BSP settings</span>';

    btnOpenSettings.addEventListener("click", () => {
        if (TDup_PredictorOptionsMenu.style.display == "block") {
            TDup_PredictorOptionsMenu.style.display = "none";
        }
        else {
            TDup_PredictorOptionsMenu.style.display = "block";
        }
    });

    topPageLinksList.appendChild(btnOpenSettings);
}

function InjectInProfilePage(node) {
    if (!node) return;

    var el = node.querySelectorAll('.empty-block')
    for (var i = 0; i < el.length; ++i) {
        if (isInjected) {
            break;
        }
        divWhereToInject = el[i];
        isInjected = true;
        if (LOCAL_API_KEY_IS_VALID) {
            GetPredictionForPlayer(ProfileTargetId, OnProfilePlayerStatsRetrieved);
        }
    }

    if (!svgAttackDivFound && LOCAL_USE_COMPARE_MODE) {
        var el2 = node.querySelectorAll('.profile-button-attack')
        for (i = 0; i < el2.length; ++i) {
            divSvgAttackToColor = el2[i].children[0];
            svgAttackDivFound = true;
        }
    }
}

function InjectInFactionPage(node) {
    if (!node) return;

    isUsingHonorBar = true;
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
                                dictDivPerPlayer[playerId] = new Array();
                            }
                            dictDivPerPlayer[playerId].push(children);
                            GetPredictionForPlayer(playerId, OnPlayerStatsRetrievedForGrid);
                            isDone = true;
                            break;
                        }
                        else {
                            var subChildren = children.children[k];
                            if (subChildren != undefined && subChildren.tagName != undefined && subChildren.tagName == "IMG") {

                                var playerId = parseInt(myArray[1]);
                                if (!(playerId in dictDivPerPlayer)) {
                                    dictDivPerPlayer[playerId] = new Array();
                                }

                                dictDivPerPlayer[playerId].push(children);
                                GetPredictionForPlayer(playerId, OnPlayerStatsRetrievedForGrid);
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

function InjectInBountyPagePage(isInit, node) {
    var el;
    if (isInit == true) {
        el = document.querySelectorAll('.target.left')
    }
    else if (node == undefined) {
        return;
    }
    else {
        el = node.querySelectorAll('.target.left')
    }

    for (i = 0; i < el.length; ++i) {
        var iter = el[i];
        var children = iter.children;
        var myArray = children[0].href.split("?XID=");
        if (myArray.length == 2) {
            var playerId = parseInt(myArray[1]);
            if (!(playerId in dictDivPerPlayer)) {
                dictDivPerPlayer[playerId] = new Array();
            }

            dictDivPerPlayer[playerId].push(iter);
            GetPredictionForPlayer(playerId, OnPlayerStatsRetrievedForGrid);
        }
    }
}

function InjectInGenericGridPage(isInit, node) {
    // For pages with several players, grid format
    var el;
    if (isInit == true) {
        el = document.querySelectorAll('.user.name')
    }
    else {
        el = node.querySelectorAll('.user.name')
    }
    for (i = 0; i < el.length; ++i) {
        var iter = el[i];
        var toSplit = iter.innerHTML;
        var myArray = toSplit.split("[");
        if (myArray.length < 2)
            continue;

        myArray = myArray[1].split("]");
        if (myArray.length < 1)
            continue;

        var children = iter.children;
        for (var k = 0; k < children.length; ++k) {
            if (children[k] != undefined && children[k].className == "honor-text-wrap") {
                isUsingHonorBar = true;
            }
        }

        var parentNode = iter.parentNode;
        var style = window.getComputedStyle(parentNode);
        if (style.display == "none") {
            continue;
        }

        var playerId = parseInt(myArray[0]);
        if (!(playerId in dictDivPerPlayer)) {
            dictDivPerPlayer[playerId] = new Array();
        }

        dictDivPerPlayer[playerId].push(iter);
        GetPredictionForPlayer(playerId, OnPlayerStatsRetrievedForGrid);
    }
}

function InitColors() {
    for (var i = 0; i < LOCAL_COLORS.length; ++i) {
        var color = localStorage["tdup.battleStatsPredictor.colorSettings_color_v5_" + i];
        if (color != undefined) {
            LOCAL_COLORS[i].color = color;
        }
        var maxvalue = localStorage["tdup.battleStatsPredictor.colorSettings_maxValue_v5_" + i];
        if (maxvalue != undefined) {
            LOCAL_COLORS[i].maxValue = parseInt(maxvalue);
        }
    }
}

(function () {
    'use strict';

    if (window.location.href.startsWith("https://www.torn.com/profiles.php")) {
        InjectOptionMenu(document.querySelector(".content-title"));
    }

    FetchServerVersion();
    InitColors();

    // Inject in already loaded page:
    if (IsPage(PageType.Profile)) {
        //InjectInProfilePage(node);
    }
    else if (LOCAL_USE_COMPARE_MODE) {
        if (IsPage(PageType.Faction)) {
            //InjectInFactionPage(node);
        }
        else if (IsPage(PageType.Bounty)) {
            InjectInBountyPagePage(true, undefined);
        }
        else {
            InjectInGenericGridPage(true, undefined);
        }
    }

    // Start observer, to inject within dynamically loaded content
    var observer = new MutationObserver(function (mutations, observer) {
        mutations.forEach(function (mutation) {
            for (const node of mutation.addedNodes) {
                if (node.querySelector) {
                    if (IsPage(PageType.Profile)) {
                        InjectInProfilePage(node);
                    }
                    else if (LOCAL_USE_COMPARE_MODE) {
                        if (IsPage(PageType.Faction)) {
                            InjectInFactionPage(node);
                        }
                        else if (IsPage(PageType.Bounty)) {
                            InjectInBountyPagePage(false, node);
                        }
                        else {
                            InjectInGenericGridPage(false, node);
                        }
                    }
                }
            }
        });
    });

    var canonical = document.querySelector("link[rel='canonical']");
    if (canonical != undefined) {
        var hrefCanon = canonical.href;
        const urlParams = new URLSearchParams(hrefCanon);
        ProfileTargetId = urlParams.get('https://www.torn.com/profiles.php?XID');
    }

    observer.observe(document, { attributes: false, childList: true, characterData: false, subtree: true });

})();