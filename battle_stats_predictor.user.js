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
// @match       https://www.torn.com/hospitalview.php*
// @match       https://www.torn.com/imarket.php*
// @match       https://www.torn.com/forums.php*
// @match       https://www.torn.com/loader.php*
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

// #region LocalStorage

const StorageKey = {
    // Used for identification to the third party (lolmanager, website handling the predictions) + doing Torn API calls on the backend, when target stats are not cached yet. Doesn't require any kind of abilitation.
    // This is the only key sent to the BSP backend.
    PrimaryAPIKey: 'tdup.battleStatsPredictor.PrimaryAPIKey',
    IsPrimaryAPIKeyValid: 'tdup.battleStatsPredictor.IsPrimaryAPIKeyValid',

    // Used only on the client side, to import user battlestats. This is not required but useful to have your stats up to date locally, for accurate color code.
    // You can fill manually your stats, or not fill your stat at all, and don't use the color code system.
    // This data is only kept in your local cache, no battle stats are sent to the BSP backend
    BattleStatsAPIKey: 'tdup.battleStatsPredictor.BattleStatsApiKey',
    IsBattleStatsAPIKeyValid: 'tdup.battleStatsPredictor.IsBattleStatsApiKeyValid',
    // Can be edited manually, or imported directly through the API
    PlayerBattleStats: 'tdup.battleStatsPredictor.playerBattleStats',

    // Used only on the client side, to import spies from TornStats.
    // Spies are only kept in your local cache, no spies is sent to the BSP backend.
    TornStatsAPIKey: 'tdup.battleStatsPredictor.TornStatsApiKey',
    IsTornStatsAPIKeyValid: 'tdup.battleStatsPredictor.IsTornStatsApiKeyValid',
    IsTornStatsEnabled: 'tdup.battleStatsPredictor.IsTornStatsEnabled',
    DaysToUseTornStatsSpy: 'tdup.battleStatsPredictor.DaysToUseTornStatsSpy',

    // Subscription
    DateSubscriptionEnd: 'tdup.battleStatsPredictor.dateSubscriptionEnd',

    // Debug options
    ShowPredictionDetails: 'tdup.battleStatsPredictor.showPredictionDetails',

    // Pages enabled
    IsBSPEnabledOnPage: 'tdup.battleStatsPredictor.IsBSPEnabledOnPage_',

    // Display choice
    IsShowingHonorBars: 'tdup.battleStatsPredictor.isShowingHonorBars',
    BSPColorTheme: 'tdup.battleStatsPredictor.BspColorTheme', //TDTODO
    ColorStatsThreshold: 'tdup.battleStatsPredictor.ColorStatsThreshold_',
};

function GetStorage(key) { return localStorage[key]; }
function GetStorageEmptyIfUndefined(key) { return (localStorage[key] == undefined) ? "" : localStorage[key]; }
function GetStorageBool(key) { return (localStorage[key] == "true") ? true : false; }
function GetStorageBoolWithDefaultValue(key, defaultValueIfUnset) {
    if (localStorage[key] == "true") return true;
    else if (localStorage[key] == "false") return false;
    else {
        SetStorage(key, defaultValueIfUnset);
        return defaultValueIfUnset;
    }
}

function SetStorage(key, value) { localStorage[key] = value; }

function GetLocalBattleStats() {
    let data = localStorage[StorageKey.PlayerBattleStats];
    if (data == undefined) {
        let localBattleStats = new Object();
        localBattleStats.Str = 0;
        localBattleStats.Def = 0;
        localBattleStats.Spd = 0;
        localBattleStats.Dex = 0;
        localBattleStats.TBS = 0;
        localBattleStats.Score = 0;
        SetLocalBattleStats(localBattleStats);
        return localBattleStats;
    }
    return JSON.parse(data);
}
function SetLocalBattleStats(value) {
    localStorage[StorageKey.PlayerBattleStats] = JSON.stringify(value);
}

// #endregion

// #region Global vars

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

var comparisonBattleStatsText;
var scoreStrInput;
var scoreDefInput;
var scoreSpdInput;
var scoreDexInput;
var subscriptionEndText;

var btnValidateTornStatsAPIKey;
var successValidateTornStatsAPIKey;
var errorValidateTornStatsAPIKey;
var btnImportTornStatsSpies;
var successImportTornStatsSpies;
var errorImportTornStatsSpies;
var mainNode;

var TDup_PredictorOptionsDiv;
var TDup_PredictorOptionsMenuArea;
var TDup_PredictorOptionsContentArea;

var isInjected = false;
var ProfileTargetId = -1;
var divWhereToInject;
var svgAttackDivFound = false;
var divSvgAttackToColor;
var dictDivPerPlayer = {};

// #endregion

// #region Styles

//var mainColor = "cadetblue";

var styleToAdd = document.createElement('style');

styleToAdd.innerHTML += '.iconStats {height: 20px; width: 32px; position: relative; text-align: center; font-size: 12px; font-weight:bold; color: black; box-sizing: border-box; border: 1px solid black;line-height: 18px;font-family: initial;}';

//styleToAdd.innerHTML += '.TDup_optionsTabContent {all : initial;}';
//styleToAdd.innerHTML += '.TDup_optionsTabContent * { all: unset;}';

/* Style the tab */
styleToAdd.innerHTML += '.TDup_optionsMenu {border: 1px solid #ccc;background-color: #f1f1f1;}';

/* Style the buttons inside the tab */
styleToAdd.innerHTML += '.TDup_optionsMenu button {display: block; text-align:center !important; height:45px; background-color: inherit; color: black; padding: 22px 16px; width: 100%; border: none; outline: none; text-align: left; cursor: pointer; transition: 0.3s;font-size: 14px; border: 1px solid white !important}';

/* Change background color of buttons on hover */
styleToAdd.innerHTML += '.TDup_optionsMenu button:hover button:focus { background-color: #99ccff !important; color: black !important}';

/* Create an active/current "tab button" class */
styleToAdd.innerHTML += '.TDup_optionsMenu button.active { background-color: ' + GetColorTheme() + ' !important; color:white}';

styleToAdd.innerHTML += '.TDup_optionsCellMenu {width:100px; background:white; height:370px; vertical-align: top !important;}';

styleToAdd.innerHTML += '.TDup_optionsCellHeader {text-align: center; font-size: 18px !important; background:' + GetColorTheme() + '; color: white;}';

styleToAdd.innerHTML += '.TDup_divBtnBsp {width: initial !important;}';

/* Buttons in Option menu content */
styleToAdd.innerHTML += '.TDup_buttonInOptionMenu { background-color: ' + GetColorTheme() + '; border-radius: 4px; border-style: none; box-sizing: border-box; color: #fff;cursor: pointer;display: inline-block; font-family: "Farfetch Basis", "Helvetica Neue", Arial, sans-serif;';
styleToAdd.innerHTML += 'font-size: 12px; margin: 5px; max-width: none; outline: none;overflow: hidden;  padding: 5px 5px; position: relative;  text-align: center;}';

/* Style the tab content */

styleToAdd.innerHTML += '.TDup_optionsTabContentDiv { padding: 10px 10px;}';
styleToAdd.innerHTML += '.TDup_optionsTabContentDiv a { display: initial !important;}';

styleToAdd.innerHTML += '.TDup_optionsTabContentDivSmall { padding: 5px 5px;}';

styleToAdd.innerHTML += '.TDup_optionsTabContent { padding: 10px 10px;  border: 1px solid #ccc;  }';
styleToAdd.innerHTML += '.TDup_optionsTabContent label { margin:10px 0px; }';
styleToAdd.innerHTML += '.TDup_optionsTabContent p { margin:10px 0px; }';
styleToAdd.innerHTML += '.TDup_optionsTabContent a { color:black !important;}';

styleToAdd.innerHTML += '.TDup_optionsTabContent input { margin:0px 10px !important; }';
styleToAdd.innerHTML += '.TDup_optionsTabContent input[type = button] { margin:0px 10px 0px 0px !important; }';
styleToAdd.innerHTML += '.TDup_optionsTabContent input[type = number] { text-align: right; }';

/*styleToAdd.innerHTML += '.TDup_optionsTabContent div { margin:10px 0px !important; }';*/

styleToAdd.innerHTML += '.TDup_button {  background-color: ' + GetColorTheme() + '; border-radius: 4px; border-style: none; box-sizing: border-box; color: #fff;cursor: pointer;display: inline-block; font-family: "Farfetch Basis", "Helvetica Neue", Arial, sans-serif;';
styleToAdd.innerHTML += 'font-size: 12px;font-weight: 100; line-height: 1;  margin: 0; max-width: none; min-width: 10px;  outline: none;overflow: hidden;  padding: 5px 5px; position: relative;  text-align: center;';
styleToAdd.innerHTML += 'text-transform: none;  user-select: none; -webkit-user-select: none;  touch-action: manipulation; width: 100%;}';
styleToAdd.innerHTML += '.TDup_button: hover, .TDup_button:focus { opacity: .75;}'

// Get the first script tag
var ref = document.querySelector('script');

// Insert our new styles before the first script tag
ref.parentNode.insertBefore(styleToAdd, ref);

// #endregion

// #region Utils

//mapPageTypeAddress.set('IndexPeople', 'https://www.torn.com/index.php?page=people');, //TDTODO ??
//mapPageTypeAddress.set('Page', 'https://www.torn.com/page.php');
//Page: 'https://www.torn.com/page.php',

const PageType = {
    Profile: 'Profile',
    RecruitCitizens: 'Recruit Citizens',
    HallOfFame: 'Hall Of Fame',
    Faction: 'Faction',
    Company: 'Company',
    Competition: 'Competition',
    Bounty: 'Bounty',
    Search: 'Search',
    Hospital: 'Hospital',
    Chain: 'Chain',
    Market: 'Market',
    Forum: 'Forum',
    ForumThread: 'ForumThread',
};

//https://www.torn.com/index.php => profile

var mapPageTypeAddress = {
    [PageType.Profile]: 'https://www.torn.com/profiles.php',
    [PageType.RecruitCitizens]: 'https://www.torn.com/bringafriend.php',
    [PageType.HallOfFame]: 'https://www.torn.com/halloffame.php',
    [PageType.Faction]: 'https://www.torn.com/factions.php',
    [PageType.Company]: 'https://www.torn.com/joblist.php',
    [PageType.Competition]: 'https://www.torn.com/competition.php',
    [PageType.Bounty]: 'https://www.torn.com/bounties.php',
    [PageType.Search]: 'https://www.torn.com/page.php',
    [PageType.Hospital]: 'https://www.torn.com/hospitalview.php',
    [PageType.Chain]: 'https://www.torn.com/factions.php?step=your#/war/chain',
    [PageType.Market]: 'https://www.torn.com/imarket.php',
    [PageType.Forum]: 'https://www.torn.com/forums.php',
    [PageType.ForumThread]: 'https://www.torn.com/forums.php#/p=threads',
}

function LogInfo(value) {
    console.log(value);
}

function JSONparse(str) {
    try {
        return JSON.parse(str);
    } catch (e) { }
    return null;
}

function FormatBattleStats(number) {
    var localized = number.toLocaleString('en-US');
    var myArray = localized.split(",");
    if (myArray.length < 1) {
        return 'ERROR';
    }

    var toReturn = myArray[0];
    if (number < 1000) return number;
    if (parseInt(toReturn) < 10) {
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

function IsPage(pageType) {
    return window.location.href.startsWith(mapPageTypeAddress[pageType]);
}

function GetColorDifference(ratio) {
    for (var i = 0; i < LOCAL_COLORS.length; ++i) {
        if (ratio < LOCAL_COLORS[i].maxValue) {
            return LOCAL_COLORS[i].color;
        }
    }
    return "#ffc0cb"; //pink
}

function IsSubscriptionValid() {

    let subscriptionEnd = GetStorage(StorageKey.DateSubscriptionEnd);
    if (subscriptionEnd == undefined)
        return true;

    var dateNow = new Date();
    var offsetInMinute = dateNow.getTimezoneOffset();
    var dateSubscriptionEnd = new Date(subscriptionEnd);
    dateSubscriptionEnd.setMinutes(dateSubscriptionEnd.getMinutes() - offsetInMinute);
    var time_difference = dateSubscriptionEnd - dateNow;
    return time_difference > 0;
}

function GetColorTheme() {
    let color = GetStorage(StorageKey.BSPColorTheme);
    if (color == undefined) {
        return "cadetblue";
    }
}

function IsNPC(targetID) {
    switch (parseInt(targetID)) {
        case 4:
        case 7:
        case 8:
        case 9:
        case 10:
        case 15:
        case 17:
        case 19:
        case 20:
        case 21:
        case 23:
            return true;
        default:
            return false;
    }
}

// #endregion

// #region Cache

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

const eSetSpyInCacheResult = {
    Error: -1,
    NewSpy: 0,
    SpyUpdated: 1,
    SpyAlreadyThere: 2
};

function SetSpyInCache(playerId, spy) {
    if (spy == undefined) {
        return eSetSpyInCacheResult.Error;
    }

    let existingSpy = GetSpyFromCache(playerId);
    if (existingSpy != undefined && existingSpy.timestamp >= spy.timestamp) {
        return eSetSpyInCacheResult.SpyAlreadyThere;
    }

    var key = "tdup.battleStatsPredictor.cache.spy." + playerId;
    spy.IsSpy = true;
    localStorage[key] = JSON.stringify(spy);
    if (existingSpy != undefined) {
        return eSetSpyInCacheResult.SpyUpdated;
    }
    else {
        return eSetSpyInCacheResult.NewSpy;
    }
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

// #endregion

// #region Get Data for Player

async function GetPredictionForPlayer(targetId, callback) {
    if (targetId == undefined || targetId < 1) return;
    if (IsNPC(targetId) == true) return;

    let targetSpy = undefined;
    if (GetStorageBool(StorageKey.IsTornStatsEnabled)) {
        targetSpy = GetSpyFromCache(targetId);
    }

    if (targetSpy != undefined) {
        let spyDateConsideredTooOld = new Date();
        let daysToUseTornStatsSpy = GetStorage(StorageKey.DaysToUseTornStatsSpy);
        spyDateConsideredTooOld.setDate(spyDateConsideredTooOld.getDate() - daysToUseTornStatsSpy);
        let spyDate = new Date(targetSpy.timestamp * 1000);
        if (spyDate > spyDateConsideredTooOld) {
            callback(targetId, targetSpy);
            return;
        }
    }

    var prediction = GetPredictionFromCache(targetId);
    if (prediction != undefined) {
        var isPredictionValid = true;
        var expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() - 1);
        var predictionDate = new Date(prediction.PredictionDate);
        if (predictionDate < expirationDate) {
            var key = "tdup.battleStatsPredictor.cache.prediction." + targetId;
            localStorage.removeItem(key);
            isPredictionValid = false;
        }

        if (isPredictionValid) {
            prediction.fromCache = true;

            if (targetSpy != undefined) {
                prediction.attachedSpy = targetSpy;
            }
            callback(targetId, prediction);
            LogInfo("Prediction for target" + targetId + " found in the cache");
            return;
        }
    }

    LogInfo("Prediction for target" + targetId + " not found in the cache, asking server..");
    const newPrediction = await FetchScoreAndTBS(targetId);
    LogInfo("Prediction for target" + targetId + " not found in the cache, value retrieved");
    if (newPrediction != undefined) {
        SetPredictionInCache(targetId, newPrediction);
    }

    if (targetSpy != undefined) {
        newPrediction.attachedSpy = targetSpy;
    }
    callback(targetId, newPrediction);
}

// #endregion

// #region Callback

function GetConsolidatedDataForPlayerStats(prediction) {
    let objectToReturn = new Object();
    objectToReturn.IsUsingSpy = prediction.IsSpy === true;
    objectToReturn.TargetTBS = 0;
    objectToReturn.Success = SUCCESS;
    objectToReturn.OldSpyStrongerThanPrediction = false;
    objectToReturn.Spy = undefined;

    let isUsingSpy = prediction.IsSpy === true;
    if (isUsingSpy) {
        objectToReturn.TargetTBS = prediction.total;
        objectToReturn.Spy = prediction;
    }
    else {
        objectToReturn.Success = prediction.Result;

        switch (prediction.Result) {
            case FAIL:
            case MODEL_ERROR:
                return objectToReturn;
            case TOO_WEAK:
            case TOO_STRONG:
            case SUCCESS:
                let intTBS = parseInt(prediction.TBS.toLocaleString('en-US').replaceAll(',', ''));
                let intTBSBalanced = parseInt(prediction.TBS_Balanced.toLocaleString('en-US').replaceAll(',', ''));

                objectToReturn.TargetTBS = (intTBS + intTBSBalanced) / 2;
                if (prediction.Result == TOO_STRONG)
                    objectToReturn.TargetTBS = intTBS;

                if (prediction.attachedSpy != undefined) {
                    if (prediction.attachedSpy.total > 0 && prediction.attachedSpy.total > objectToReturn.TargetTBS) {
                        objectToReturn.TargetTBS = prediction.attachedSpy.total;
                        objectToReturn.OldSpyStrongerThanPrediction = true;
                    }
                }

                break;
        }
    }

    return objectToReturn;
}

function OnProfilePlayerStatsRetrieved(playerId, prediction) {
    if (prediction == undefined) {
        return;
    }

    let localBattleStats = GetLocalBattleStats();
    let localTBS = localBattleStats.TBS;
    let consolidatedData = GetConsolidatedDataForPlayerStats(prediction);

    let tbsRatio = 100 * consolidatedData.TargetTBS / localTBS;
    let colorComparedToUs = GetColorDifference(tbsRatio);

    let formattedBattleStats = FormatBattleStats(consolidatedData.TargetTBS);
    if (consolidatedData.Success == FAIL) {
        colorComparedToUs = "pink";
        formattedBattleStats = "Wait";
    } else if (consolidatedData.Success == MODEL_ERROR) {
        colorComparedToUs = "pink";
        formattedBattleStats = "Error";
    }

    let extraIndicator = '';
    if (consolidatedData.IsUsingSpy) {
        extraIndicator = '<img title="Data coming from spy" width="13" height="13" style="position:absolute; margin: 5px -10px;z-index: 101;" src="https://freesvg.org/storage/img/thumb/primary-favorites.png"/>';
    }
    else if (consolidatedData.OldSpyStrongerThanPrediction) {
        extraIndicator = '<img title="Old spy having greater TBS than prediction, showing old spy data" width="18" height="18" style="position:absolute; margin: 0px -20px; z-index: 102;" src="https://cdn3.iconfinder.com/data/icons/data-storage-5/16/floppy_disk-512.png"/>';
    }

    divWhereToInject.innerHTML += '<div style="font-size: 18px; text-align: center; margin-top:7px">' + extraIndicator + '<img title="Spy" src="https://game-icons.net/icons/000000/transparent/1x1/delapouite/weight-lifting-up.png" width="18" height="18" style="margin-right:5px;"/>' +
        formattedBattleStats + ' <label style = "color:' + colorComparedToUs + '"; "> (' + tbsRatio.toFixed(0) + '%) </label></div >';
}

function OnPlayerStatsRetrievedForGrid(targetId, prediction) {
    var urlAttack = "https://www.torn.com/loader2.php?sid=getInAttack&user2ID=" + targetId;
    let isShowingHonorBars = GetStorageBoolWithDefaultValue(StorageKey.IsShowingHonorBars, true);
    let spyMargin = '-6px 23px';
    let mainMarginWhenDisplayingHonorBars = "-10px -9px";

    if (IsPage(PageType.Chain) && !isShowingHonorBars) {
        spyMargin = '-1px 23px';
    }
    else if (IsPage(PageType.Faction) && isShowingHonorBars) {
        spyMargin = '-16px 15px';
    }
    else if (IsPage(PageType.Search) && isShowingHonorBars) {
        mainMarginWhenDisplayingHonorBars = '6px -8px';
    }
    else if (IsPage(PageType.Company) && isShowingHonorBars) {
        mainMarginWhenDisplayingHonorBars = '0px';
    }
    else if (IsPage(PageType.RecruitCitizens) && isShowingHonorBars) {
        mainMarginWhenDisplayingHonorBars = '0px';
    }
    else if (IsPage(PageType.HallOfFame) && isShowingHonorBars) {
        mainMarginWhenDisplayingHonorBars = '0px';
    }
    else if (IsPage(PageType.Hospital) && isShowingHonorBars) {
        mainMarginWhenDisplayingHonorBars = '0px 6px';
    }
    else if (IsPage(PageType.Forum)) {
        spyMargin = '0px 23px';
        if (isShowingHonorBars) {
            mainMarginWhenDisplayingHonorBars = '7px 0px';
            if (IsPage(PageType.ForumThread)) {
                spyMargin = '-5px 15px';
                mainMarginWhenDisplayingHonorBars = '-26px 28px';
            }
        }
    }
    else if (IsPage(PageType.Bounty)) {
        isShowingHonorBars = false; // No honor bars in bounty page, ever.
    }

    let localBattleStats = GetLocalBattleStats();
    let localTBS = localBattleStats.TBS;
    let consolidatedData = GetConsolidatedDataForPlayerStats(prediction);

    let tbsRatio = 100 * consolidatedData.TargetTBS / localTBS;
    let colorComparedToUs = GetColorDifference(tbsRatio);

    let formattedBattleStats = FormatBattleStats(consolidatedData.TargetTBS);
    if (consolidatedData.Success == FAIL) {
        colorComparedToUs = "pink";
        formattedBattleStats = "Wait";
    } else if (consolidatedData.Success == MODEL_ERROR) {
        colorComparedToUs = "pink";
        formattedBattleStats = "Error";
    }

    let extraIndicator = '';
    if (consolidatedData.IsUsingSpy) {
        extraIndicator = '<img title="Data coming from spy" width="13" height="13" style="position:absolute; margin:' + spyMargin + ';z-index: 101;" src="https://freesvg.org/storage/img/thumb/primary-favorites.png" />';
    }
    else if (consolidatedData.OldSpyStrongerThanPrediction) {
        extraIndicator = '<img title="Old spy having greater TBS than prediction -> showing old spy data instead" width="13" height="13" style="position:absolute; margin:' + spyMargin + ';z-index: 101;" src="https://cdn3.iconfinder.com/data/icons/data-storage-5/16/floppy_disk-512.png" />';
    }

    if (isShowingHonorBars)
        toInject = '<a href="' + urlAttack + '" target="_blank">' + extraIndicator + '<div style="position: absolute;z-index: 100;margin: ' + mainMarginWhenDisplayingHonorBars + '"><div class="iconStats" style="background:' + colorComparedToUs + '">' + formattedBattleStats + '</div></div></a>';
    else
        toInject = '<a href="' + urlAttack + '" target="_blank">' + extraIndicator + '<div style="display: inline-block; margin-right:5px;"><div class="iconStats" style="background:' + colorComparedToUs + '">' + formattedBattleStats + '</div></div></a>';

    for (var i = 0; i < dictDivPerPlayer[targetId].length; i++) {
        if (dictDivPerPlayer[targetId][i].innerHTML.startsWith('<a href="https://www.torn.com/loader2.php?sid=getInAttack')) {
            continue;
        }
        dictDivPerPlayer[targetId][i].innerHTML = toInject + dictDivPerPlayer[targetId][i].innerHTML;
    }
}

// #endregion

// #region Option Menus

function OpenOptionsTab(evt, optionsTabName) {
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

function BuildOptionMenu(menuArea, contentArea, name, shouldBeHiddenWhenInactive, isOpenAtStart = false) {
    // Adding the button in the tabs
    let TabEntryBtn = document.createElement("button");
    TabEntryBtn.className = "TDup_tablinks";
    if (shouldBeHiddenWhenInactive == true)
        TabEntryBtn.className += " TDup_tablinksShouldBeHiddenWhenInactive";

    if (isOpenAtStart)
        TabEntryBtn.id = "TDup_tablinks_defaultOpen";

    TabEntryBtn.innerHTML = name;
    TabEntryBtn.addEventListener("click", function (evt) {
        OpenOptionsTab(evt, "TDup_optionsTabContent_" + name);
    });

    menuArea.appendChild(TabEntryBtn);

    // Adding the corresponding div
    let TabContent = document.createElement("div");
    TabContent.className = "TDup_optionsTabContent";
    TabContent.id = "TDup_optionsTabContent_" + name;
    contentArea.appendChild(TabContent);

    return TabContent;
}

function BuildOptionMenu_Global(tabs, menu) {
    let contentDiv = BuildOptionMenu(tabs, menu, "Global", false, true);

    // API Key
    let mainAPIKeyLabel = document.createElement("label");
    mainAPIKeyLabel.innerHTML = 'API Key';

    let mainAPIKeyInput = document.createElement("input");
    mainAPIKeyInput.value = GetStorageEmptyIfUndefined(StorageKey.PrimaryAPIKey);

    btnValidatemainAPIKey = document.createElement("input");
    btnValidatemainAPIKey.type = "button";
    btnValidatemainAPIKey.value = "Validate";
    btnValidatemainAPIKey.className = "TDup_buttonInOptionMenu";

    function OnTornAPIKeyVerified(success, reason) {
        btnValidatemainAPIKey.disabled = false;
        SetStorage(StorageKey.IsPrimaryAPIKeyValid, success);
        if (success === true) {
            successValidatemainAPIKey.style.visibility = "visible";
            apiRegister.style.display = "none";
            FetchUserDataFromBSPServer();
        }
        else {
            RefreshOptionMenuWithSubscription();
            errorValidatemainAPIKey.style.visibility = "visible";
            apiRegister.style.display = "block";
            errorValidatemainAPIKey.innerHTML = reason;
            subscriptionEndText.innerHTML = '<div style="color:#1E88E5">Please fill a valid API Key, and press on validate to get your subscription details</div>';
        }
    }

    btnValidatemainAPIKey.addEventListener("click", () => {
        errorValidatemainAPIKey.style.visibility = "hidden";
        successValidatemainAPIKey.style.visibility = "hidden";
        btnValidatemainAPIKey.disabled = true;
        SetStorage(StorageKey.PrimaryAPIKey, mainAPIKeyInput.value);
        VerifyTornAPIKey(OnTornAPIKeyVerified);
    });

    successValidatemainAPIKey = document.createElement("label");
    successValidatemainAPIKey.innerHTML = 'API Key verified and saved!';
    successValidatemainAPIKey.style.color = 'green';
    successValidatemainAPIKey.style.visibility = "hidden";

    errorValidatemainAPIKey = document.createElement("label");
    errorValidatemainAPIKey.innerHTML = 'Error while verifying API Key';
    errorValidatemainAPIKey.style.backgroundColor = 'red';
    errorValidatemainAPIKey.style.visibility = "hidden";

    let mainAPIKeyDiv = document.createElement("div");
    mainAPIKeyDiv.className = "TDup_optionsTabContentDiv";
    mainAPIKeyDiv.appendChild(mainAPIKeyLabel);
    mainAPIKeyDiv.appendChild(mainAPIKeyInput);
    mainAPIKeyDiv.appendChild(btnValidatemainAPIKey);
    mainAPIKeyDiv.appendChild(successValidatemainAPIKey);
    mainAPIKeyDiv.appendChild(errorValidatemainAPIKey);
    contentDiv.appendChild(mainAPIKeyDiv);

    let apiRegister = document.createElement("div");
    apiRegister.className = "TDup_optionsTabContentDiv";
    apiRegister.innerHTML = '<a href="https://www.torn.com/preferences.php#tab=api?step=addNewKey&title=BSP_Main&user=basic,personalstats,profile" target="_blank"><input type"button" class="TDup_buttonInOptionMenu" value="Generate a basic key"/></a>';
    contentDiv.appendChild(apiRegister);

    // Subscription info
    subscriptionEndText = document.createElement("div");
    subscriptionEndText.className = "TDup_optionsTabContentDiv";
    subscriptionEndText.innerHTML = '<div style="color:#1E88E5">Please fill a valid API Key, and press on validate to get your subscription details</div>';

    if (GetStorageBoolWithDefaultValue(StorageKey.IsPrimaryAPIKeyValid, false) == true) {
        apiRegister.style.display = "none";
        subscriptionEndText.innerHTML = '<div style="color:#1E88E5">Fetching subscription infos, please </div>';
    }
    contentDiv.appendChild(subscriptionEndText);
}

function BuildOptionMenu_Colors(tabs, menu) {
    let contentDiv = BuildOptionMenu(tabs, menu, "Colors", true);

    let localBattleStats = GetLocalBattleStats();

    // API Key
    let gymStatsAPIKeyLabel = document.createElement("label");
    gymStatsAPIKeyLabel.innerHTML = 'API Key';

    let gymStatsAPIKeyInput = document.createElement("input");
    if (GetStorage(StorageKey.BattleStatsAPIKey)) {
        gymStatsAPIKeyInput.value = GetStorage(StorageKey.BattleStatsAPIKey);
    }

    btnValidategymStatsAPIKey = document.createElement("input");
    btnValidategymStatsAPIKey.type = "button";
    btnValidategymStatsAPIKey.value = "Import stats";
    btnValidategymStatsAPIKey.className = "TDup_buttonInOptionMenu";

    successValidategymStatsAPIKey = document.createElement("label");
    successValidategymStatsAPIKey.innerHTML = 'Stats imported!';
    successValidategymStatsAPIKey.style.color = 'green';
    successValidategymStatsAPIKey.style.visibility = "hidden";

    errorValidategymStatsAPIKey = document.createElement("label");
    errorValidategymStatsAPIKey.innerHTML = 'Error while verifying gymStats API Key';
    errorValidategymStatsAPIKey.style.backgroundColor = 'red';
    errorValidategymStatsAPIKey.style.visibility = "hidden";

    function ReComputeStats() {
        let localBattleStats = new Object();
        localBattleStats.Str = parseInt(scoreStrInput.value);
        localBattleStats.Def = parseInt(scoreDefInput.value);
        localBattleStats.Spd = parseInt(scoreSpdInput.value);
        localBattleStats.Dex = parseInt(scoreDexInput.value);
        localBattleStats.TBS = localBattleStats.Str + localBattleStats.Def + localBattleStats.Spd + localBattleStats.Dex;
        localBattleStats.Score = parseInt(Math.sqrt(localBattleStats.Str) + Math.sqrt(localBattleStats.Def) + Math.sqrt(localBattleStats.Spd) + Math.sqrt(localBattleStats.Dex));

        SetLocalBattleStats(localBattleStats);
        comparisonBattleStatsText.innerHTML = "TBS = " + localBattleStats.TBS.toLocaleString('en-US') + " | Battle Score = " + localBattleStats.Score.toLocaleString('en-US');
    }

    function OnPlayerStatsFromTornAPI(success, stats, reason) {
        btnValidategymStatsAPIKey.disabled = false;
        SetStorage(StorageKey.IsBattleStatsAPIKeyValid, success);
        if (success === true) {
            successValidategymStatsAPIKey.style.visibility = "visible";
            apiRegister.style.display = "none";

            scoreStrInput.value = parseInt(stats.strength);
            scoreDefInput.value = parseInt(stats.defense);
            scoreSpdInput.value = parseInt(stats.speed);
            scoreDexInput.value = parseInt(stats.dexterity);

            ReComputeStats();
        }
        else {
            apiRegister.style.display = "block";
            errorValidategymStatsAPIKey.style.visibility = "visible";
            errorValidategymStatsAPIKey.innerHTML = reason;
        }
    }

    btnValidategymStatsAPIKey.addEventListener("click", () => {
        errorValidategymStatsAPIKey.style.visibility = "hidden";
        successValidategymStatsAPIKey.style.visibility = "hidden";
        btnValidategymStatsAPIKey.disabled = true;
        SetStorage(StorageKey.BattleStatsAPIKey, gymStatsAPIKeyInput.value);
        GetPlayerStatsFromTornAPI(OnPlayerStatsFromTornAPI);
    });

    let gymStatsApiKeyDiv = document.createElement("div");
    gymStatsApiKeyDiv.className = "TDup_optionsTabContentDiv";
    gymStatsApiKeyDiv.appendChild(gymStatsAPIKeyLabel);
    gymStatsApiKeyDiv.appendChild(gymStatsAPIKeyInput);
    gymStatsApiKeyDiv.appendChild(btnValidategymStatsAPIKey);
    gymStatsApiKeyDiv.appendChild(successValidategymStatsAPIKey);
    gymStatsApiKeyDiv.appendChild(errorValidategymStatsAPIKey);
    contentDiv.appendChild(gymStatsApiKeyDiv);

    let apiRegister = document.createElement("div");
    apiRegister.className = "TDup_optionsTabContentDiv";
    apiRegister.innerHTML = '<a href="https://www.torn.com/preferences.php#tab=api?step=addNewKey&title=BSP_Main&user=basic,personalstats,profile,battlestats" target="_blank"><input type"button" class="TDup_buttonInOptionMenu" style="width:280px;" value="Generate a key with access to your battlestats"/></a>';
    contentDiv.appendChild(apiRegister);

    if (GetStorageBoolWithDefaultValue(StorageKey.IsBattleStatsAPIKeyValid, false) == true) {
        apiRegister.style.display = "none";
    }

    // COMPARISON STATS PART
    let comparisonBattleStatsNode = document.createElement("div");
    comparisonBattleStatsNode.className = "TDup_optionsTabContentDiv";
    contentDiv.appendChild(comparisonBattleStatsNode);

    var cell, raw, table;
    table = document.createElement('table');

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
    scoreDexInput.value = localBattleStats.Dex;

    scoreDexInput.addEventListener('change', () => {
        if (scoreDexInput.value) scoreDexInput.value = parseInt(scoreDexInput.value);
        else scoreDexInput.value = 0;

        ReComputeStats();
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
    scoreSpdInput.value = localBattleStats.Spd;

    scoreSpdInput.addEventListener('change', () => {
        if (scoreSpdInput.value) scoreSpdInput.value = parseInt(scoreSpdInput.value);
        else scoreSpdInput.value = 0;

        ReComputeStats();
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
    scoreDefInput.value = localBattleStats.Def;

    scoreDefInput.addEventListener('change', () => {
        if (scoreDefInput.value) scoreDefInput.value = parseInt(scoreDefInput.value);
        else scoreDefInput.value = 0;

        ReComputeStats();
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
    scoreStrInput.value = localBattleStats.Str;

    scoreStrInput.addEventListener('change', () => {
        if (scoreStrInput.value) scoreStrInput.value = parseInt(scoreStrInput.value);
        else scoreStrInput.value = 0;

        ReComputeStats();
    });
    cell = raw.insertCell(1);
    cell.style.textAlign = 'left';
    cell.appendChild(scoreStrInput);

    comparisonBattleStatsText = document.createElement("div");
    comparisonBattleStatsText.className = "TDup_optionsTabContentDiv";
    comparisonBattleStatsText.innerHTML = "TBS = " + localBattleStats.TBS.toLocaleString('en-US') + " | Battle Score = " + localBattleStats.Score.toLocaleString('en-US');

    comparisonBattleStatsNode.appendChild(comparisonBattleStatsText);

    let colorSettingsNode = document.createElement("div");
    colorSettingsNode.className = "TDup_optionsTabContentDiv";

    function AddColorPanel(document, colorSettingsNode, colorItem, id) {
        let divColor = document.createElement("div");

        let text = document.createElement("label");
        text.innerHTML = 'Up to';
        divColor.appendChild(text);

        let colorThresholdInput = document.createElement("input");
        colorThresholdInput.type = 'number';
        colorThresholdInput.value = parseInt(colorItem.maxValue);
        colorThresholdInput.style.width = '70px';
        colorThresholdInput.disabled = !colorItem.canModify;

        colorThresholdInput.addEventListener("change", () => {
            let newThresholdMaxValue = parseInt(colorThresholdInput.value);
            LOCAL_COLORS[id].maxValue = newThresholdMaxValue;
            SetStorage(StorageKey.ColorStatsThreshold + id, JSON.stringify(LOCAL_COLORS[id]));
        });

        divColor.appendChild(colorThresholdInput);
        colorItem.inputNumber = colorThresholdInput;

        let textPercent = document.createElement("label");
        textPercent.innerHTML = '% of TBS';
        divColor.appendChild(textPercent);

        let colorPickerInput = document.createElement("input");
        colorPickerInput.type = "color";
        colorPickerInput.value = colorItem.color;

        colorPickerInput.addEventListener("change", () => {
            LOCAL_COLORS[id].color = colorPickerInput.value;
            SetStorage(StorageKey.ColorStatsThreshold + id, JSON.stringify(LOCAL_COLORS[id]));
        });

        divColor.appendChild(colorPickerInput);
        colorItem.inputColor = colorPickerInput;

        colorSettingsNode.appendChild(divColor);
    }

    let colorExplanations = document.createElement("label");
    colorExplanations.innerHTML = "Color code used when displaying a Torn player, relative to the TBS you defined above";
    colorSettingsNode.appendChild(colorExplanations);

    for (var i = 0; i < LOCAL_COLORS.length; ++i) {
        let colorThresholdstr = GetStorage(StorageKey.ColorStatsThreshold + i);
        if (colorThresholdstr != undefined && colorThresholdstr != "[object Object]") {
            let colorThreshold = JSON.parse(colorThresholdstr);
            LOCAL_COLORS[i] = colorThreshold;
        }
        AddColorPanel(document, colorSettingsNode, LOCAL_COLORS[i], i);
    }

    contentDiv.appendChild(colorSettingsNode);
}

function BuildOptionMenu_Pages(tabs, menu) {
    let contentDiv = BuildOptionMenu(tabs, menu, "Pages", true);

    // Displaying Honor bars
    let isShowingHonorBarsNode = document.createElement("div");
    isShowingHonorBarsNode.className = "TDup_optionsTabContentDiv";
    let isShowingHonorBars = GetStorageBoolWithDefaultValue(StorageKey.IsShowingHonorBars, true);

    let checkboxIsShowingHonorBars = document.createElement('input');
    checkboxIsShowingHonorBars.type = "checkbox";
    checkboxIsShowingHonorBars.name = "name";
    checkboxIsShowingHonorBars.value = "value";
    checkboxIsShowingHonorBars.id = "idIsShowingHonorBars";
    checkboxIsShowingHonorBars.checked = isShowingHonorBars;

    checkboxIsShowingHonorBars.addEventListener("change", () => {
        let isShowingHonorBarsNew = checkboxIsShowingHonorBars.checked;
        SetStorage(StorageKey.IsShowingHonorBars, isShowingHonorBarsNew);
    });

    var isShowingHonorBarsLabel = document.createElement('label')
    isShowingHonorBarsLabel.htmlFor = "idIsShowingHonorBars";
    isShowingHonorBarsLabel.appendChild(document.createTextNode('Are you displaying honor bars?'));
    isShowingHonorBarsNode.appendChild(isShowingHonorBarsLabel);
    isShowingHonorBarsNode.appendChild(checkboxIsShowingHonorBars);
    contentDiv.appendChild(isShowingHonorBarsNode);


    let textExplanation = document.createElement("div");
    textExplanation.className = "TDup_optionsTabContentDiv";
    textExplanation.innerHTML = "Select where BSP is enabled";
    contentDiv.appendChild(textExplanation);

    // Pages where it's enabled
    let divForCheckbox = document.createElement("div");
    BuildOptionsCheckboxPageWhereItsEnabled(divForCheckbox, PageType.Profile, true);
    BuildOptionsCheckboxPageWhereItsEnabled(divForCheckbox, PageType.Faction, true);
    BuildOptionsCheckboxPageWhereItsEnabled(divForCheckbox, PageType.Bounty, true);
    BuildOptionsCheckboxPageWhereItsEnabled(divForCheckbox, PageType.Search, true);
    BuildOptionsCheckboxPageWhereItsEnabled(divForCheckbox, PageType.Competition, true);
    BuildOptionsCheckboxPageWhereItsEnabled(divForCheckbox, PageType.HallOfFame, true);
    BuildOptionsCheckboxPageWhereItsEnabled(divForCheckbox, PageType.RecruitCitizens, false);
    BuildOptionsCheckboxPageWhereItsEnabled(divForCheckbox, PageType.Company, false);
    BuildOptionsCheckboxPageWhereItsEnabled(divForCheckbox, PageType.Hospital, false);
    BuildOptionsCheckboxPageWhereItsEnabled(divForCheckbox, PageType.Market, false);
    BuildOptionsCheckboxPageWhereItsEnabled(divForCheckbox, PageType.Forum, false);
    contentDiv.appendChild(divForCheckbox);
}

function BuildOptionsCheckboxPageWhereItsEnabled(parentDiv, pageType, defaultValue) {

    let pageCheckBoxNode = document.createElement("div");
    pageCheckBoxNode.className = "TDup_optionsTabContentDivSmall";

    let checkboxPage = document.createElement('input');
    checkboxPage.type = "checkbox";
    checkboxPage.name = "name";
    checkboxPage.value = "value";
    checkboxPage.style.margin = "5px 10px";
    checkboxPage.id = "id_" + pageType;
    checkboxPage.checked = GetStorageBoolWithDefaultValue(StorageKey.IsBSPEnabledOnPage + pageType, defaultValue);

    checkboxPage.addEventListener("change", () => {
        let isBSPEnabledForThisPage = checkboxPage.checked;
        SetStorage(StorageKey.IsBSPEnabledOnPage + pageType, isBSPEnabledForThisPage);
    });

    var checkboxLabel = document.createElement('label')
    checkboxLabel.htmlFor = checkboxPage.id;
    checkboxLabel.appendChild(document.createTextNode(pageType));
    pageCheckBoxNode.appendChild(checkboxPage);
    pageCheckBoxNode.appendChild(checkboxLabel);
    parentDiv.appendChild(pageCheckBoxNode);
}

function BuildOptionMenu_TornStats(tabs, menu) {
    let contentDiv = BuildOptionMenu(tabs, menu, "TornStats", true);

    let tornStatsCheckBoxNode = document.createElement("div");
    tornStatsCheckBoxNode.className = "TDup_optionsTabContentDiv";
    let tornStatsEnabled = GetStorageBool(StorageKey.IsTornStatsEnabled);

    let checkboxTornStats = document.createElement('input');
    checkboxTornStats.type = "checkbox";
    checkboxTornStats.name = "name";
    checkboxTornStats.value = "value";
    checkboxTornStats.id = "idUseTornStatsSpies";
    checkboxTornStats.checked = tornStatsEnabled;

    checkboxTornStats.addEventListener("change", () => {
        let TornStatsEnabled = checkboxTornStats.checked;
        tornStatsNode.style.display = TornStatsEnabled ? "block" : "none";
        SetStorage(StorageKey.IsTornStatsEnabled, TornStatsEnabled);
    });

    var tornStatsCheckboxLabel = document.createElement('label')
    tornStatsCheckboxLabel.htmlFor = "idUseTornStatsSpies";
    tornStatsCheckboxLabel.appendChild(document.createTextNode('Use TornStats spies'));
    tornStatsCheckBoxNode.appendChild(tornStatsCheckboxLabel);

    tornStatsCheckBoxNode.appendChild(checkboxTornStats);
    contentDiv.appendChild(tornStatsCheckBoxNode);

    // TornStats spies
    let tornStatsNode = document.createElement("div");
    tornStatsNode.className = "TDup_optionsTabContentDiv";

    let tornStatsAPIKeyLabel = document.createElement("label");
    tornStatsAPIKeyLabel.innerHTML = 'TornStats API Key';

    let tornStatsAPIKeyInput = document.createElement("input");
    if (GetStorage(StorageKey.TornStatsAPIKey)) {
        tornStatsAPIKeyInput.value = GetStorage(StorageKey.TornStatsAPIKey);
    }

    btnValidateTornStatsAPIKey = document.createElement("input");
    btnValidateTornStatsAPIKey.type = "button";
    btnValidateTornStatsAPIKey.value = "Validate";
    btnValidateTornStatsAPIKey.className = "TDup_buttonInOptionMenu";

    successValidateTornStatsAPIKey = document.createElement("label");
    successValidateTornStatsAPIKey.innerHTML = 'TornStats API Key verified';
    successValidateTornStatsAPIKey.style.color = 'green';
    successValidateTornStatsAPIKey.style.visibility = "hidden";

    errorValidateTornStatsAPIKey = document.createElement("label");
    errorValidateTornStatsAPIKey.innerHTML = 'Error';
    errorValidateTornStatsAPIKey.style.backgroundColor = 'red';
    errorValidateTornStatsAPIKey.style.visibility = "hidden";

    let tornStatsApiKeyDiv = document.createElement("div");
    tornStatsApiKeyDiv.className = "TDup_optionsTabContentDiv";
    tornStatsApiKeyDiv.appendChild(tornStatsAPIKeyLabel);
    tornStatsApiKeyDiv.appendChild(tornStatsAPIKeyInput);
    tornStatsApiKeyDiv.appendChild(btnValidateTornStatsAPIKey);
    tornStatsApiKeyDiv.appendChild(successValidateTornStatsAPIKey);
    tornStatsApiKeyDiv.appendChild(errorValidateTornStatsAPIKey);
    tornStatsNode.appendChild(tornStatsApiKeyDiv);
    tornStatsNode.style.display = tornStatsEnabled ? "block" : "none";

    function OnTornStatsAPIKeyValidated(success, reason) {
        btnValidateTornStatsAPIKey.disabled = false;
        SetStorage(StorageKey.IsTornStatsAPIKeyValid, success);
        if (success === true) {
            successValidateTornStatsAPIKey.style.visibility = "visible";
            errorValidateTornStatsAPIKey.style.visibility = "hidden";
        }
        else {
            errorValidateTornStatsAPIKey.style.visibility = "visible";
            successValidateTornStatsAPIKey.style.visibility = "hidden";
            errorValidateTornStatsAPIKey.innerHTML = reason;
        }
    }

    btnValidateTornStatsAPIKey.addEventListener("click", () => {
        btnValidateTornStatsAPIKey.disabled = true;
        SetStorage(StorageKey.TornStatsAPIKey, tornStatsAPIKeyInput.value);
        VerifyTornStatsAPIKey(OnTornStatsAPIKeyValidated);
    });

    let tornStatsNumberOfDaysDiv = document.createElement("div");
    tornStatsNumberOfDaysDiv.className = "TDup_optionsTabContentDiv";
    let tornStatsNumberOfDaysDivLabel = document.createElement("label");
    tornStatsNumberOfDaysDivLabel.innerHTML = 'Display spy instead of prediction if spy more recent than ';

    let tornStatsNumberOfDaysDivLabelPart2 = document.createElement("label");
    tornStatsNumberOfDaysDivLabelPart2.innerHTML = 'days';

    let tornStatsNumberOfDaysInput = document.createElement("input");
    tornStatsNumberOfDaysInput.type = 'number';
    tornStatsNumberOfDaysInput.style.width = '60px';
    if (GetStorage(StorageKey.DaysToUseTornStatsSpy) == undefined) {
        SetStorage(StorageKey.DaysToUseTornStatsSpy, 30);
    }
    tornStatsNumberOfDaysInput.value = parseInt(GetStorage(StorageKey.DaysToUseTornStatsSpy));

    tornStatsNumberOfDaysInput.addEventListener("change", () => {
        let numberOfDaysNewValue = parseInt(tornStatsNumberOfDaysInput.value);
        SetStorage(StorageKey.DaysToUseTornStatsSpy, numberOfDaysNewValue);
    });

    tornStatsNumberOfDaysDiv.appendChild(tornStatsNumberOfDaysDivLabel);
    tornStatsNumberOfDaysDiv.appendChild(tornStatsNumberOfDaysInput);
    tornStatsNumberOfDaysDiv.appendChild(tornStatsNumberOfDaysDivLabelPart2);
    tornStatsNode.appendChild(tornStatsNumberOfDaysDiv);

    let tornStatsImportTipsDiv = document.createElement("div");
    tornStatsImportTipsDiv.className = "TDup_optionsTabContentDiv";
    tornStatsImportTipsDiv.innerHTML = 'To import spies, go on a specific faction, and click on the [BSP IMPORT SPIES] button at the top of the page';
    tornStatsNode.appendChild(tornStatsImportTipsDiv);

    contentDiv.appendChild(tornStatsNode);
}

function BuildOptionMenu_Debug(tabs, menu) {
    let contentDiv = BuildOptionMenu(tabs, menu, "Debug", false);

    // USE SHOW PREDICTION DETAILS
    let PredictionDetailsBoxNode = document.createElement("div");
    PredictionDetailsBoxNode.className = "TDup_optionsTabContentDiv";
    let checkboxPredictionDetails = document.createElement('input');
    checkboxPredictionDetails.type = "checkbox";
    checkboxPredictionDetails.name = "name";
    checkboxPredictionDetails.value = "value";
    checkboxPredictionDetails.id = "id";
    checkboxPredictionDetails.checked = GetStorageBoolWithDefaultValue(StorageKey.ShowPredictionDetails, false);
    checkboxPredictionDetails.addEventListener("change", () => {
        let showPredictionDetails = checkboxPredictionDetails.checked;
        SetStorage(StorageKey.ShowPredictionDetails, showPredictionDetails);
    });

    var checkboxPredictionDetailsLabel = document.createElement('label')
    checkboxPredictionDetailsLabel.htmlFor = "id";
    checkboxPredictionDetailsLabel.appendChild(document.createTextNode('Show prediction details'));
    PredictionDetailsBoxNode.appendChild(checkboxPredictionDetailsLabel);
    PredictionDetailsBoxNode.appendChild(checkboxPredictionDetails);
    //contentDiv.appendChild(PredictionDetailsBoxNode); TDTODO

    var divbuttonClearLocalCache = document.createElement("div");
    divbuttonClearLocalCache.className = "TDup_optionsTabContentDiv";
    var buttonClearLocalCache = document.createElement("input");
    buttonClearLocalCache.type = "button";
    buttonClearLocalCache.value = "Clear predictor local storage";
    buttonClearLocalCache.className = "TDup_buttonInOptionMenu";

    buttonClearLocalCache.addEventListener("click", () => {
        buttonClearLocalCache.disabled = true;
        if (confirm("BSP - IMPORTANT \r\n \r\nAre you sure you want to clear BSP keys, stats, settings, spies and predictions from your local cache? \r\n \r\nIt will only impact this script: you will have to do the setup again (setup keys, import spies etc)") == true) {
            CleanAllPredictorStorage();
        }
        buttonClearLocalCache.disabled = false;
    });

    divbuttonClearLocalCache.appendChild(buttonClearLocalCache);
    contentDiv.appendChild(divbuttonClearLocalCache);
}

function BuildOptionMenu_Infos(menuArea, contentArea) {
    let contentDiv = BuildOptionMenu(menuArea, contentArea, "Infos", false);

    let TabContent_Content = document.createElement("div");
    TabContent_Content.className = "TDup_optionsTabContentDiv";
    TabContent_Content.innerHTML = "Script version : " + GM_info.script.version;
    contentDiv.appendChild(TabContent_Content);

    let ForumThread = document.createElement("div");
    ForumThread.className = "TDup_optionsTabContentDiv";
    ForumThread.innerHTML = 'Read basic setup, Q&A and R+ the script if you like it on the <a href="https://www.torn.com/forums.php#/p=threads&f=67&t=16290324&b=0&a=0&to=22705010"> Forum thread</a>';
    contentDiv.appendChild(ForumThread);

    let DiscordLink = document.createElement("div");
    DiscordLink.className = "TDup_optionsTabContentDiv";

    let DiscordText = document.createElement("div");
    DiscordText.innerHTML = 'Give feedback, report bugs or just come to say hi on the Discord';
    DiscordLink.appendChild(DiscordText);

    let DiscordLinkImg = document.createElement("div");
    DiscordLinkImg.style.textAlign = "center";
    DiscordLinkImg.innerHTML = '<a href="https://discord.gg/zgrVX5j6MQ"><img width="64" height="64" title="Discord" src="https://wiki.soldat.pl/images/6/6f/DiscordLogo.png" /> </a>';

    DiscordLink.appendChild(DiscordLinkImg);

    contentDiv.appendChild(DiscordLink);
}

function RefreshOptionMenuWithSubscription() {
    const pagesShouldBeHiddenWhenInactive = document.getElementsByClassName("TDup_tablinksShouldBeHiddenWhenInactive");
    let isValid = GetStorageBool(StorageKey.IsPrimaryAPIKeyValid) && IsSubscriptionValid();
    for (let i = 0; i < pagesShouldBeHiddenWhenInactive.length; i++) {
        pagesShouldBeHiddenWhenInactive[i].style.display = isValid ? "block" : "none";
    }
}

function BuildSettingsMenu(node) {

    TDup_PredictorOptionsDiv = document.createElement("div");
    TDup_PredictorOptionsDiv.style.background = "lightgray";

    TDup_PredictorOptionsMenuArea = document.createElement("div");
    TDup_PredictorOptionsMenuArea.className = "TDup_optionsMenu";

    TDup_PredictorOptionsContentArea = document.createElement("div");

    var cell, table;
    table = document.createElement('table');
    table.style = 'width:100%; border:2px solid ' + GetColorTheme() + ';';

    let thead = table.createTHead();
    let rowHeader = thead.insertRow();
    let th = document.createElement("th");
    th.className = "TDup_optionsCellHeader";
    th.colSpan = 2;
    let text = document.createTextNode("BSP Settings");
    th.appendChild(text);
    rowHeader.appendChild(th);

    let raw = table.insertRow();
    cell = raw.insertCell();
    cell.className = "TDup_optionsCellMenu";
    cell.appendChild(TDup_PredictorOptionsMenuArea);

    cell = raw.insertCell();
    cell.appendChild(TDup_PredictorOptionsContentArea);
    TDup_PredictorOptionsDiv.appendChild(table);
    node.appendChild(TDup_PredictorOptionsDiv);

    BuildOptionMenu_Global(TDup_PredictorOptionsMenuArea, TDup_PredictorOptionsContentArea, true);
    BuildOptionMenu_Colors(TDup_PredictorOptionsMenuArea, TDup_PredictorOptionsContentArea);
    BuildOptionMenu_Pages(TDup_PredictorOptionsMenuArea, TDup_PredictorOptionsContentArea);
    BuildOptionMenu_TornStats(TDup_PredictorOptionsMenuArea, TDup_PredictorOptionsContentArea);
    BuildOptionMenu_Debug(TDup_PredictorOptionsMenuArea, TDup_PredictorOptionsContentArea);
    BuildOptionMenu_Infos(TDup_PredictorOptionsMenuArea, TDup_PredictorOptionsContentArea);

    TDup_PredictorOptionsDiv.style.display = "none";

    // Get the element with id="defaultOpen" and click on it
    document.getElementById("TDup_tablinks_defaultOpen").click();

    RefreshOptionMenuWithSubscription();
}

// #endregion

// #region Inject into pages

function InjectOptionMenu(node) {
    if (!node) return;

    mainNode = node;
    var topPageLinksList = node.querySelector("#top-page-links-list");
    if (topPageLinksList == undefined)
        return;

    node.style.position = "relative";
    BuildSettingsMenu(node);

    let btnOpenSettings = document.createElement("a");
    btnOpenSettings.className = "t-clear h c-pointer  line-h24 right TDup_divBtnBsp";
    btnOpenSettings.innerHTML = '<div class="TDup_button">BSP Settings</div>';

    btnOpenSettings.addEventListener("click", () => {
        if (TDup_PredictorOptionsDiv.style.display == "block") {
            TDup_PredictorOptionsDiv.style.display = "none";
        }
        else {
            TDup_PredictorOptionsDiv.style.display = "block";
            if (GetStorageBool(StorageKey.IsPrimaryAPIKeyValid)) {
                FetchUserDataFromBSPServer();
            }
        }
    });

    topPageLinksList.appendChild(btnOpenSettings);
}

function InjectImportSpiesButton(node) {
    if (!node) return;

    if (!GetStorageBool(StorageKey.IsTornStatsEnabled) || !GetStorageBool(StorageKey.IsTornStatsAPIKeyValid)) return;

    mainNode = node;
    var topPageLinksList = node.querySelector("#top-page-links-list");
    if (topPageLinksList == undefined)
        return;

    node.style.position = "relative";

    let btnImportTornStatsSpies = document.createElement("a");
    btnImportTornStatsSpies.className = "t-clear h c-pointer  line-h24 right TDup_divBtnBsp";
    btnImportTornStatsSpies.innerHTML = '<div class="TDup_button">BSP Import Spies</div>';

    let successImportTornStatsSpiesForFaction = document.createElement("label");
    successImportTornStatsSpiesForFaction.innerHTML = 'Spies imported!';
    successImportTornStatsSpiesForFaction.style.color = 'green';
    successImportTornStatsSpiesForFaction.style.visibility = "hidden";

    let errorImportTornStatsSpiesForFaction = document.createElement("label");
    errorImportTornStatsSpiesForFaction.innerHTML = 'Error while fetching spies from TornStats';
    errorImportTornStatsSpiesForFaction.style.backgroundColor = 'red';
    errorImportTornStatsSpiesForFaction.style.display = "none";

    const URLPage = new URL(window.location.href);
    let factionIdStr = URLPage.searchParams.get('ID');

    if (factionIdStr == undefined) {
        var el = document.querySelector('.faction-info');
        if (el != undefined) {
            factionIdStr = el.getAttribute("data-faction");
        }
        else {
            el = document.querySelector('.forum-thread');
            if (el != undefined && el.href != undefined) {
                let hrefArray = el.href.split('a=');
                if (hrefArray.length == 2) {
                    factionIdStr = hrefArray[1];
                }
            }
        }

    }

    let factionId = parseInt(factionIdStr);

    if (factionId > 0) {
        btnImportTornStatsSpies.addEventListener("click", () => {
            btnImportTornStatsSpies.disabled = true;
            FetchFactionSpiesFromTornStats(factionId, btnImportTornStatsSpies, successImportTornStatsSpiesForFaction, errorImportTornStatsSpiesForFaction);
        });

        topPageLinksList.appendChild(btnImportTornStatsSpies);
        topPageLinksList.appendChild(successImportTornStatsSpiesForFaction);
        topPageLinksList.appendChild(errorImportTornStatsSpiesForFaction);
    }
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
        if (GetStorageBool(StorageKey.IsPrimaryAPIKeyValid)) {
            GetPredictionForPlayer(ProfileTargetId, OnProfilePlayerStatsRetrieved);
        }
    }

    if (!svgAttackDivFound) {
        var el2 = node.querySelectorAll('.profile-button-attack')
        for (i = 0; i < el2.length; ++i) {
            divSvgAttackToColor = el2[i].children[0];
            svgAttackDivFound = true;
        }
    }
}

function InjectInFactionPage(node) {
    if (!node) return;

    el = node.querySelectorAll('a');
    for (i = 0; i < el.length; ++i) {
        var isDone = false;
        var iter = el[i];
        if (iter.href != null) {
            //"https://www.torn.com/profiles.php?XID=2139172"
            var myArray = iter.href.split("?XID=");
            if (myArray.length == 2) {
                let playerId = parseInt(myArray[1]);
                if (iter.rel == "noopener noreferrer") {
                    if (!(playerId in dictDivPerPlayer)) {
                        dictDivPerPlayer[playerId] = new Array();
                    }
                    dictDivPerPlayer[playerId].push(iter);
                    GetPredictionForPlayer(playerId, OnPlayerStatsRetrievedForGrid);
                    isDone = true;
                }

                for (var j = 0; j < iter.children.length; ++j) {
                    if (isDone) {
                        break;
                    }
                    var children = iter.children[j];
                    for (var k = 0; k < children.children.length; ++k) {

                        if (children != undefined && children.tagName != undefined && children.tagName == "IMG") {
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

// #endregion

// #region Script OnLoad
function InitColors() {
    for (var i = 0; i < LOCAL_COLORS.length; ++i) {
        let colorThresholdstr = GetStorage(StorageKey.ColorStatsThreshold + i);
        if (colorThresholdstr != undefined) {
            let colorThreshold = JSON.parse(colorThresholdstr);
            LOCAL_COLORS[i] = colorThreshold;
        }
    }
}

function IsBSPEnabledOnCurrentPage() {
    for ([key, val] of Object.entries(PageType)) {
        if (IsPage(val)) {
            return GetStorageBool(StorageKey.IsBSPEnabledOnPage + val);
        }
    }
    return false;
}

(function () {
    'use strict';

    InitColors();

    if (window.location.href.startsWith("https://www.torn.com/profiles.php")) {
        InjectOptionMenu(document.querySelector(".content-title"));
    }

    if (window.location.href.startsWith("https://www.torn.com/factions.php")) {
        InjectImportSpiesButton(document.querySelector(".content-title"));
    }

    if (!IsSubscriptionValid()) {
        return;
    }

    if (!IsBSPEnabledOnCurrentPage()) {
        return;
    }

    // Inject in already loaded page:
    if (IsPage(PageType.Profile)) {
        //InjectInProfilePage(node);
    }
    else if (IsPage(PageType.Faction)) {
        //InjectInFactionPage(node);
    }
    else if (IsPage(PageType.Bounty)) {
        InjectInBountyPagePage(true, undefined);
    }
    else {
        InjectInGenericGridPage(true, undefined);
    }

    // Start observer, to inject within dynamically loaded content
    var observer = new MutationObserver(function (mutations, observer) {
        mutations.forEach(function (mutation) {
            for (const node of mutation.addedNodes) {
                if (node.querySelector) {
                    if (IsPage(PageType.Profile)) {
                        InjectInProfilePage(node);
                    }
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

// #endregion

// #region API BSP

function FetchUserDataFromBSPServer() {
    return new Promise((resolve, reject) => {
        GM.xmlHttpRequest({
            method: 'GET',
            url: `http://www.lol-manager.com/api/battlestats/user/${GetStorage(StorageKey.PrimaryAPIKey)}/${GM_info.script.version}`,
            headers: {
                'Content-Type': 'application/json'
            },
            onload: (response) => {
                try {
                    let result = JSON.parse(response.responseText);
                    if (result == undefined) {
                        subscriptionEndText.innerHTML = '<div style="color:red">WARNING - An error occured while fetching the subscription end date.</div>';
                        return;
                    }

                    SetStorage(StorageKey.DateSubscriptionEnd, result.SubscriptionEnd);

                    if (result.SubscriptionActive) {
                        var dateNow = new Date();
                        var offsetInMinute = dateNow.getTimezoneOffset();
                        var dateSubscriptionEnd = new Date(result.SubscriptionEnd);
                        dateSubscriptionEnd.setMinutes(dateSubscriptionEnd.getMinutes() - offsetInMinute);
                        var time_difference = dateSubscriptionEnd - dateNow;
                        var days_difference = parseInt(time_difference / (1000 * 60 * 60 * 24));
                        var hours_difference = parseInt(time_difference / (1000 * 60 * 60));
                        hours_difference %= 24;
                        var minutes_difference = parseInt(time_difference / (1000 * 60));
                        minutes_difference %= 60;

                        subscriptionEndText.innerHTML = '<div style="color:#1E88E5">Your subscription expires in '
                            + parseInt(days_difference) + ' day' + (days_difference > 1 ? 's' : '') + ', '
                            + parseInt(hours_difference) + ' hour' + (hours_difference > 1 ? 's' : '') + ', '
                            + parseInt(minutes_difference) + ' minute' + (minutes_difference > 1 ? 's' : '') + '.<br /><br />You can extend it for 1xan/15days (send to <a style="display:inline-block;" href="https://www.torn.com/profiles.php?XID=2660552">TDup[2660552]</a> with msg "bsp". Process is automated and treated within a minute)</div>';
                    }
                    else {
                        subscriptionEndText.innerHTML = '<div style="color:#1E88E5">WARNING - Your subscription has expired.<br />You can renew it for 1xan/15days (send to <a style="display:inline-block;" href="https://www.torn.com/profiles.php?XID=2660552">TDup[2660552]</a> with msg bsp. Process is automated and treated within a minute)</div>';
                    }

                    RefreshOptionMenuWithSubscription();

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
            url: `http://www.lol-manager.com/api/battlestats/${GetStorage(StorageKey.PrimaryAPIKey)}/${targetId}/${GM_info.script.version}`,
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


// #endregion

// #region API Torn

function VerifyTornAPIKey(callback) {
    var urlToUse = "https://api.torn.com/user/?comment=BSPAuth&key=" + GetStorage(StorageKey.PrimaryAPIKey);
    GM.xmlHttpRequest({
        method: "GET",
        url: urlToUse,
        onload: (r) => {
            let j = JSONparse(r.responseText);
            if (!j) {
                callback(false, "Couldn't check (unexpected response)");
                return;
            }

            if (j.error && j.error.code > 0) {
                callback(false, j.error.error);
                return;
            }

            if (j.status != undefined && !j.status) {
                callback(false, "unknown issue");
                return;
            }
            else {
                callback(true);
                return;
            }
        },
        onabort: () => callback(false, "Couldn't check (aborted)"),
        onerror: () => callback(false, "Couldn't check (error)"),
        ontimeout: () => callback(false, "Couldn't check (timeout)")
    })
}

function GetPlayerStatsFromTornAPI(callback) {
    var urlToUse = "https://api.torn.com/user/?selections=battlestats&comment=BSPGetStats&key=" + GetStorage(StorageKey.BattleStatsAPIKey);
    GM.xmlHttpRequest({
        method: "GET",
        url: urlToUse,
        onload: (r) => {
            let j = JSONparse(r.responseText);
            if (!j) {
                callback(false, undefined, "Couldn't check (unexpected response)");
                return;
            }

            if (j.error && j.error.code > 0) {
                callback(false, undefined, j.error.error);
                return;
            }

            if (j.status != undefined && !j.status) {
                callback(false, undefined, "unknown issue");
                return;
            }
            else {
                callback(true, j);
            }
        },
        onabort: () => callback(false, undefined, "Couldn't check (aborted)"),
        onerror: () => callback(false, undefined, "Couldn't check (error)"),
        ontimeout: () => callback(false, undefined, "Couldn't check (timeout)")
    })
}

// #endregion

// #region API TornStats
function VerifyTornStatsAPIKey(callback) {
    return new Promise((resolve, reject) => {
        GM.xmlHttpRequest({
            method: 'GET',
            url: `https://www.tornstats.com/api/v2/${GetStorage(StorageKey.TornStatsAPIKey)}`,
            headers: {
                'Content-Type': 'application/json'
            },
            onload: (response) => {
                try {
                    var result = JSON.parse(response.responseText);
                    if (result == undefined) {
                        callback(false, "Error while calling TornStats");
                        return;
                    }
                    if (result.status === false) {
                        callback(false, result.message);
                        return;
                    }

                    callback(true);

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

function FetchFactionSpiesFromTornStats(factionId, button, successElem, failedElem) {
    return new Promise((resolve, reject) => {
        GM.xmlHttpRequest({
            method: 'GET',
            url: `https://www.tornstats.com/api/v2/${GetStorage(StorageKey.TornStatsAPIKey)}/spy/faction/${factionId}`,
            headers: {
                'Content-Type': 'application/json'
            },
            onload: (response) => {
                try {
                    button.disabled = false;
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
                    let spyUpdated = 0;
                    for (var key in results.faction.members) {
                        let factionMember = results.faction.members[key];
                        if (factionMember.spy == undefined) {
                            continue;
                        }
                        membersCount++;
                        let setSpyInCacheResult = SetSpyInCache(factionMember.id, factionMember.spy);
                        if (setSpyInCacheResult == eSetSpyInCacheResult.NewSpy) {
                            newSpiesAdded++;
                        }
                        else if (setSpyInCacheResult == eSetSpyInCacheResult.SpyUpdated) {
                            spyUpdated++;
                        }
                    }

                    failedElem.style.visibility = "hidden";
                    successElem.style.visibility = "visible";
                    successElem.style.display = "block";
                    successElem.innerHTML = "Success! " + membersCount + " spies fetched from TornStats. " + newSpiesAdded + " new spies added. " + spyUpdated + " spies updated";
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

// #endregion
