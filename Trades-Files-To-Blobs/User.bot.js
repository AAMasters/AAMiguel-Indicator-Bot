exports.newUserBot = function newUserBot(BOT, COMMONS, UTILITIES, DEBUG_MODULE, BLOB_STORAGE, FILE_STORAGE) {

    const FULL_LOG = true;
    const LOG_FILE_CONTENT = false;

    let bot = BOT;

    const GMT_SECONDS = ':00.000 GMT+0000';
    const GMT_MILI_SECONDS = '.000 GMT+0000';
    const ONE_DAY_IN_MILISECONDS = 24 * 60 * 60 * 1000;

    const MODULE_NAME = "User Bot";

    const EXCHANGE_NAME = "Poloniex";

    const TRADES_FOLDER_NAME = "Trades";

    const logger = DEBUG_MODULE.newDebugLog();
    logger.fileName = MODULE_NAME;
    logger.bot = bot;

    const commons = COMMONS.newCommons(bot, DEBUG_MODULE, UTILITIES);

    thisObject = {
        initialize: initialize,
        start: start
    };

    let charlyFileStorage = FILE_STORAGE.newFileStorage(bot);
    let charlyBlobStorage = BLOB_STORAGE.newBlobStorage(bot);

    let utilities = UTILITIES.newUtilities(bot);

    let year;
    let month;

    let dependencies;

    return thisObject;

    function initialize(pDependencies, pMonth, pYear, callBackFunction) {

        try {

            year = pYear;
            month = pMonth;
            month = utilities.pad(month, 2); // Adding a left zero when needed.
            dependencies = pDependencies;

            logger.fileName = MODULE_NAME + "-" + year + "-" + month;

            if (FULL_LOG === true) { logger.write("[INFO] initialize -> Entering function."); }
            if (FULL_LOG === true) { logger.write("[INFO] initialize -> pYear = " + year); }
            if (FULL_LOG === true) { logger.write("[INFO] initialize -> pMonth = " + month); }

            dependencies = pDependencies;

            commons.initializeStorage(charlyFileStorage, charlyBlobStorage, onInizialized);

            function onInizialized(err) {

                if (err.result === global.DEFAULT_OK_RESPONSE.result) {

                    if (FULL_LOG === true) { logger.write("[INFO] initialize -> onInizialized -> Initialization Succeed."); }
                    callBackFunction(global.DEFAULT_OK_RESPONSE);

                } else {
                    logger.write("[ERROR] initialize -> onInizialized -> err = " + err.message);
                    callBackFunction(err);
                }
            }

        } catch (err) {
            logger.write("[ERROR] initialize -> err = " + err.message);
            callBackFunction(global.DEFAULT_FAIL_RESPONSE);
        }
    }

    /*
    This process is going to do the following:
    Read the trades from Charly's Output at File Storage and and write the same content to Charly's Blob Storage.
    */

    function start(callBackFunction) {

        try {

            if (FULL_LOG === true) { logger.write("[INFO] start -> Entering function."); }

            let processDate = new Date(year + "-" + month + "-1 00:00:00.000 GMT+0000");
            let lastMinuteOfMonth = new Date(year + "-" + month + "-1 00:00:00.000 GMT+0000");

            lastMinuteOfMonth.setUTCMonth(lastMinuteOfMonth.getUTCMonth() + 1);             // First we go 1 month into the future.
            lastMinuteOfMonth.setUTCSeconds(lastMinuteOfMonth.getUTCSeconds() - 30);        // Then we go back 30 seconds, or to the last minute of the original month.

            let thisDatetime = new Date();

            if ((year === thisDatetime.getUTCFullYear() && month > thisDatetime.getUTCMonth() + 1) || year > thisDatetime.getUTCFullYear()) {

                logger.write("[ERROR] start -> We are too far in the future. Bot will not execute now.");

                let customOK = {
                    result: global.CUSTOM_OK_RESPONSE.result,
                    message: "Too far in the future."
                }
                logger.write("[WARN] start -> getContextVariables -> customOK = " + customOK.message);
                callBackFunction(customOK);
                return;
            }

            let atHeadOfMarket;         // This tell us if we are at the month which includes the head of the market according to current datetime.
            if ((parseInt(year) === thisDatetime.getUTCFullYear() && parseInt(month) === thisDatetime.getUTCMonth() + 1)) {
                atHeadOfMarket = true;
            } else {
                atHeadOfMarket = false;
            }

            let market = global.MARKET;

            let lastProcessDay;         // Datetime of the last file certified by the Hole Fixing process as without permanent holes.
            let firstTradeFile;         // Datetime of the first trade file in the whole market history.
            let lastFileWithoutHoles;   // Datetime of the last verified file without holes.
            let lastTradeFile;          // Datetime pointing to the last Trade File sucessfuly processed and included in the last file.

            getContextVariables();

            function getContextVariables() {

                try {

                    if (FULL_LOG === true) { logger.write("[INFO] start -> getContextVariables -> Entering function."); }

                    let thisReport;
                    let reportKey;

                    /* First Status Report */

                    reportKey = "AAMasters" + "-" + "AACharly" + "-" + "Poloniex-Historic-Trades" + "-" + "dataSet.V1";
                    if (FULL_LOG === true) { logger.write("[INFO] start -> getContextVariables -> reportKey = " + reportKey); }

                    if (dependencies.statusReports.get(reportKey).status === "Status Report is corrupt.") {
                        logger.write("[ERROR] start -> getContextVariables -> Can not continue because dependecy Status Report is corrupt. ");
                        callBackFunction(global.DEFAULT_RETRY_RESPONSE);
                        return;
                    }

                    thisReport = dependencies.statusReports.get(reportKey).file;

                    if (thisReport.lastFile === undefined) {
                        logger.write("[WARN] start -> getContextVariables -> Undefined Last File. -> reportKey = " + reportKey);
                        logger.write("[HINT] start -> getContextVariables -> It is too early too run this process since the trade history of the market is not there yet.");

                        let customOK = {
                            result: global.CUSTOM_OK_RESPONSE.result,
                            message: "Dependency does not exist."
                        }
                        logger.write("[WARN] start -> getContextVariables -> customOK = " + customOK.message);
                        callBackFunction(customOK);
                        return;
                    }

                    if (thisReport.completeHistory === true) {  // We get from the file to know if this markets history is complete or not. 

                        firstTradeFile = new Date(thisReport.lastFile.year + "-" + thisReport.lastFile.month + "-" + thisReport.lastFile.days + " " + thisReport.lastFile.hours + ":" + thisReport.lastFile.minutes + GMT_SECONDS);

                        /* Before processing this month we need to check if it is not too far in the past.*/

                        if (
                            processDate.getUTCFullYear() < firstTradeFile.getUTCFullYear()
                            ||
                            (processDate.getUTCFullYear() === firstTradeFile.getUTCFullYear() && processDate.getUTCMonth() < firstTradeFile.getUTCMonth())
                        ) {
                            logger.write("[WARN] start -> getContextVariables -> The current year / month is before the start of the market history for market.");
                            let customOK = {
                                result: global.CUSTOM_OK_RESPONSE.result,
                                message: "Month before it is needed."
                            }
                            logger.write("[WARN] start -> getContextVariables -> customOK = " + customOK.message);
                            callBackFunction(customOK);
                            return;
                        }

                    } else {
                        logger.write("[WARN] start -> getContextVariables -> Trade History is not complete.");

                        let customOK = {
                            result: global.CUSTOM_OK_RESPONSE.result,
                            message: "Dependency not ready."
                        }
                        logger.write("[WARN] start -> getContextVariables -> customOK = " + customOK.message);
                        callBackFunction(customOK);
                        return;
                    }

                    /* Next Status Report */

                    reportKey = "AAMasters" + "-" + "AACharly" + "-" + "Poloniex-Hole-Fixing" + "-" + "dataSet.V1" + "-" + year + "-" + month; 
                    if (FULL_LOG === true) { logger.write("[INFO] start -> getContextVariables -> reportKey = " + reportKey); }

                    if (dependencies.statusReports.get(reportKey).status === "Status Report is corrupt.") {
                        logger.write("[ERROR] start -> getContextVariables -> Can not continue because dependecy Status Report is corrupt. ");
                        callBackFunction(global.DEFAULT_RETRY_RESPONSE);
                        return;
                    }

                    thisReport = dependencies.statusReports.get(reportKey).file;

                    if (thisReport.lastFile === undefined) {
                        logger.write("[WARN] start -> getContextVariables -> Undefined Last File. -> reportKey = " + reportKey);
                        logger.write("[HINT] start -> getContextVariables -> It is too early too run this process since the hole fixing process has not started yet for this month.");

                        let customOK = {
                            result: global.CUSTOM_OK_RESPONSE.result,
                            message: "Dependency does not exist."
                        }
                        logger.write("[WARN] start -> getContextVariables -> customOK = " + customOK.message);
                        callBackFunction(customOK);
                        return;
                    }

                    if (thisReport.monthChecked === true) {

                        lastFileWithoutHoles = new Date();  // We need this with a valid value.

                    } else {

                        /*
                        If the hole report is incomplete, we are only interested if we are at the head of the market.
                        Otherwise, we are not going to calculate the candles of a month which was not fully checked for holes.
                        */

                        if (atHeadOfMarket === true) {

                            lastFileWithoutHoles = new Date(thisReport.lastFile.year + "-" + thisReport.lastFile.month + "-" + thisReport.lastFile.days + " " + thisReport.lastFile.hours + ":" + thisReport.lastFile.minutes + GMT_SECONDS);

                        } else {

                            let customOK = {
                                result: global.CUSTOM_OK_RESPONSE.result,
                                message: "Dependency not ready."
                            }
                            logger.write("[WARN] start -> getContextVariables -> customOK = " + customOK.message);
                            callBackFunction(customOK);
                            return;
                        }
                    }

                     /* Final Status Report */

                    reportKey = "AAMasters" + "-" + "AAMiguel" + "-" + "Trades-Files-To-Blobs" + "-" + "dataSet.V1" + "-" + year + "-" + month;
                    if (FULL_LOG === true) { logger.write("[INFO] start -> getContextVariables -> reportKey = " + reportKey); }

                    if (dependencies.statusReports.get(reportKey).status === "Status Report is corrupt.") {
                        logger.write("[ERROR] start -> getContextVariables -> Can not continue because self dependecy Status Report is corrupt. Aborting Process.");
                        callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                        return;
                    }

                    thisReport = dependencies.statusReports.get(reportKey).file;

                    if (thisReport.lastFile === undefined) {
                        logger.write("[WARN] start -> getContextVariables -> Undefined Last File. -> reportKey = " + reportKey);
                        logger.write("[HINT] start -> getContextVariables -> If the status report does not exist we will point the lastProcessDay to the last day of the previous month.");

                        lastProcessDay = new Date(processDate.valueOf() - ONE_DAY_IN_MILISECONDS);
                        migrateData();
                        return;
                    }

                    if (thisReport.monthCompleted === true) {

                        logger.write("[WARN] start -> getContextVariables -> The current year / month was already fully processed.");

                        let customOK = {
                            result: global.CUSTOM_OK_RESPONSE.result,
                            message: "Month fully processed."
                        }
                        logger.write("[WARN] start -> getContextVariables -> customOK = " + customOK.message);
                        callBackFunction(customOK);
                        return;

                    } else {

                        lastProcessDay = new Date(thisReport.lastFile.year + "-" + thisReport.lastFile.month + "-" + thisReport.lastFile.days + " " + "00:00" + GMT_SECONDS);

                        if (thisReport.fileComplete === true) {

                            migrateData();

                        } else {

                            lastTradeFile = new Date(thisReport.lastTradeFile.year + "-" + thisReport.lastTradeFile.month + "-" + thisReport.lastTradeFile.days + " " + thisReport.lastTradeFile.hours + ":" + thisReport.lastTradeFile.minutes + GMT_SECONDS);
                            migrateData();
                        }
                    }

                } catch (err) {
                    logger.write("[ERROR] start -> getContextVariables -> err = " + err.message);
                    if (err.message === "Cannot read property 'file' of undefined") {
                        logger.write("[HINT] start -> getContextVariables -> Check the bot configuration to see if all of its dependencies declarations are correct. ");
                        logger.write("[HINT] start -> getContextVariables -> Dependencies loaded -> keys = " + JSON.stringify(dependencies.keys));
                    }
                    callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                }
            }

            function migrateData() {

                if (FULL_LOG === true) { logger.write("[INFO] start -> migrateData -> Entering function."); }

                try {
                    nextDay();

                    function nextDay() {

                        try {
                            if (FULL_LOG === true) { logger.write("[INFO] start -> migrateData -> nextDay -> Entering function."); }

                            lastProcessDay = new Date(lastProcessDay.valueOf() + ONE_DAY_IN_MILISECONDS);

                            let date = new Date(lastProcessDay.valueOf() - 60 * 1000);

                            if (date.valueOf() < firstTradeFile.valueOf()) {  // At the special case where we are at the begining of the market, this might be true.
                                date = new Date(firstTradeFile.valueOf() - 60 * 1000);
                            }

                            if (lastTradeFile !== undefined) {
                                date = new Date(lastTradeFile.valueOf());
                            }

                            nextMinute();

                            function nextMinute() {

                                try {
                                    if (FULL_LOG === true) { logger.write("[INFO] start -> migrateData -> nextDay -> nextMinute -> Entering function."); }

                                    date = new Date(date.valueOf() + 60 * 1000);

                                    /* Check if we are outside the current Day / File */

                                    if (date.getUTCDate() !== lastProcessDay.getUTCDate()) {

                                        writeStatusReport(lastProcessDay, lastTradeFile, false, onStatusReportWritten);
                                        return;

                                        function onStatusReportWritten(err) {

                                            try {
                                                if (FULL_LOG === true) { logger.write("[INFO] start -> migrateData -> nextDay -> nextMinute -> onStatusReportWritten -> Entering function."); }

                                                if (err.result !== global.DEFAULT_OK_RESPONSE.result) {
                                                    logger.write("[ERROR] start -> migrateData -> nextDay -> nextMinute -> onStatusReportWritten -> err = " + err.message);
                                                    callBackFunction(err);
                                                    return;
                                                }

                                                nextDay();

                                                return;
                                            } catch (err) {
                                                logger.write("[ERROR] start -> migrateData -> nextDay -> nextMinute -> onStatusReportWritten -> err = " + err.message);
                                                callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                                                return;
                                            }
                                        }
                                    }

                                    /* Check if we are outside the currrent Month */

                                    if (date.getUTCMonth() + 1 !== parseInt(month)) {

                                        if (FULL_LOG === true) { logger.write("[INFO] start -> migrateData -> nextDay -> nextMinute -> End of the month reached at date = " + date.toUTCString()); }

                                        lastProcessDay = new Date(lastProcessDay.valueOf() - ONE_DAY_IN_MILISECONDS);

                                        writeStatusReport(lastProcessDay, lastTradeFile, true, onStatusReportWritten);
                                        return;

                                        function onStatusReportWritten(err) {

                                            try {
                                                if (FULL_LOG === true) { logger.write("[INFO] start -> migrateData -> nextDay -> nextMinute -> onStatusReportWritten -> Entering function."); }

                                                if (err.result !== global.DEFAULT_OK_RESPONSE.result) {
                                                    logger.write("[ERROR] start -> migrateData -> nextDay -> nextMinute -> onStatusReportWritten -> err = " + err.message);
                                                    callBackFunction(err);
                                                    return;
                                                }

                                                let customOK = {
                                                    result: global.CUSTOM_OK_RESPONSE.result,
                                                    message: "End of the month reached."
                                                }
                                                logger.write("[WARN] start -> migrateData -> nextDay -> nextMinute -> onStatusReportWritten -> customOK = " + customOK.message);
                                                callBackFunction(customOK);

                                                return;
                                            } catch (err) {
                                                logger.write("[ERROR] start -> migrateData -> nextDay -> nextMinute -> onStatusReportWritten -> err = " + err.message);
                                                callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                                                return;
                                            }
                                        }
                                    }

                                    /* Check if we have past the most recent hole fixed file */

                                    if (date.valueOf() > lastFileWithoutHoles.valueOf()) {

                                        writeStatusReport(lastProcessDay, lastTradeFile, false, onStatusReportWritten);
                                        return;

                                        function onStatusReportWritten(err) {

                                            try {
                                                if (FULL_LOG === true) { logger.write("[INFO] start -> migrateData -> nextDay -> nextMinute -> onStatusReportWritten -> Entering function."); }

                                                if (err.result !== global.DEFAULT_OK_RESPONSE.result) {
                                                    logger.write("[ERROR] start -> migrateData -> nextDay -> nextMinute -> onStatusReportWritten -> err = " + err.message);
                                                    callBackFunction(err);
                                                    return;
                                                }

                                                if (FULL_LOG === true) {
                                                    logger.write("[INFO] start -> migrateData -> nextDay -> nextMinute -> Head of the market reached for market " + market.assetA + '_' + market.assetB + ".");
                                                }

                                                callBackFunction(global.DEFAULT_OK_RESPONSE);
                                                return;

                                            } catch (err) {
                                                logger.write("[ERROR] start -> migrateData -> nextDay -> nextMinute -> onStatusReportWritten -> err = " + err.message);
                                                callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                                                return;
                                            }
                                        }
                                    }

                                    readTrades();

                                } catch (err) {
                                    logger.write("[ERROR] start -> migrateData -> nextDay -> nextMinute -> err = " + err.message);
                                    callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                                }
                            }

                            function readTrades() {

                                try {
                                    if (FULL_LOG === true) { logger.write("[INFO] start -> migrateData -> nextDay -> nextMinute -> readTrades -> Entering function."); }

                                    lastTradeFile = new Date(date.valueOf());

                                    let dateForPath = date.getUTCFullYear() + '/' + utilities.pad(date.getUTCMonth() + 1, 2) + '/' + utilities.pad(date.getUTCDate(), 2) + '/' + utilities.pad(date.getUTCHours(), 2) + '/' + utilities.pad(date.getUTCMinutes(), 2);
                                    let fileName = market.assetA + '_' + market.assetB + ".json"
                                    let filePathRoot = bot.devTeam + "/" + "AACharly" + "." + bot.version.major + "." + bot.version.minor + "/" + global.PLATFORM_CONFIG.codeName + "." + global.PLATFORM_CONFIG.version.major + "." + global.PLATFORM_CONFIG.version.minor + "/" + global.EXCHANGE_NAME + "/" + bot.dataSetVersion;
                                    let filePath = filePathRoot + "/Output/" + TRADES_FOLDER_NAME + '/' + dateForPath;

                                    charlyFileStorage.getTextFile(filePath, fileName, onFileReceived);

                                    function onFileReceived(err, text) {

                                        let tradesFile;

                                        try {
                                            if (FULL_LOG === true) { logger.write("[INFO] start -> migrateData -> nextDay -> readTrades -> onFileReceived -> Entering function."); }

                                            if (err.result !== global.DEFAULT_OK_RESPONSE.result) {
                                                logger.write("[ERROR] start -> migrateData -> nextDay -> readTrades -> onFileReceived -> err = " + err.message);
                                                logger.write("[ERROR] start -> migrateData -> nextDay -> readTrades -> onFileReceived ->  text = " + text);
                                                callBackFunction(err);
                                                return;
                                            }

                                            if (LOG_FILE_CONTENT === true) {
                                                logger.write("[INFO] start -> migrateData -> nextDay -> readTrades -> onFileReceived ->  text = " + text);
                                            }

                                            let trades = JSON.parse(text);

                                            charlyBlobStorage.createTextFile(filePath, fileName, text, onFileCreated);

                                            function onFileCreated(err) {

                                                try {

                                                    if (FULL_LOG === true) { logger.write("[INFO] start -> migrateData -> nextDay -> readTrades -> onFileReceived -> onFileCreated -> Entering function."); }

                                                    if (err.result !== global.DEFAULT_OK_RESPONSE.result) {
                                                        logger.write("[ERROR] start -> migrateData -> nextDay -> readTrades -> onFileReceived -> onFileCreated -> err = " + err.message);
                                                        callBackFunction(err);
                                                        return;
                                                    }

                                                    if (LOG_FILE_CONTENT === true) {
                                                        logger.write("[INFO] start -> migrateData -> nextDay -> readTrades -> onFileReceived -> onFileCreated -> fileContent = " + fileContent);
                                                    }

                                                    logger.write("[INFO] start -> migrateData -> nextDay -> readTrades -> onFileReceived -> onFileCreated -> " + trades.length + " records inserted in File " + filePath + "/" + fileName + "");

                                                    nextMinute();

                                                } catch (err) {
                                                    logger.write("[ERROR] start -> migrateData -> nextDay -> readTrades -> onFileReceived -> onFileCreated -> err = " + err.message);
                                                    callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                                                }
                                            }

                                        } catch (err) {

                                            logger.write("[ERROR] start -> migrateData -> nextDay -> readTrades -> onFileReceived -> err = " + err.message);
                                            logger.write("[ERROR] start -> migrateData -> nextDay -> readTrades -> onFileReceived -> filePath = " + filePath);
                                            logger.write("[ERROR] start -> migrateData -> nextDay -> readTrades -> onFileReceived ->  text = " + text);
                                            logger.write("[HINT] start -> migrateData -> nextDay -> readTrades -> onFileReceived -> Empty or corrupt volume file found.");
                                            
                                            callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                                            return;
                                        }
                                    }
                                } catch (err) {
                                    logger.write("[ERROR] start -> migrateData -> nextDay -> readTrades -> err = " + err.message);
                                    callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                                }
                            }

                        } catch (err) {
                            logger.write("[ERROR] start -> migrateData -> nextDay -> err = " + err.message);
                            callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                        }
                    }

                } catch (err) {
                    logger.write("[ERROR] start -> migrateData -> err = " + err.message);
                    callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                }
            }

            function writeStatusReport(lastFileDate, lastTradeFile, isMonthComplete, callBack) {

                if (FULL_LOG === true) { logger.write("[INFO] start -> writeStatusReport -> Entering function."); }
                if (FULL_LOG === true) { logger.write("[INFO] start -> writeStatusReport -> lastFileDate = " + lastFileDate); }
                if (FULL_LOG === true) { logger.write("[INFO] start -> writeStatusReport -> isMonthComplete = " + isMonthComplete); }

                try {

                    let key = bot.devTeam + "-" + bot.codeName + "-" + bot.process + "-" + bot.dataSetVersion + "-" + year + "-" + month;
                    let statusReport = dependencies.statusReports.get(key);

                    statusReport.file = {
                        lastFile: {
                            year: lastFileDate.getUTCFullYear(),
                            month: (lastFileDate.getUTCMonth() + 1),
                            days: lastFileDate.getUTCDate()
                        },
                        lastTradeFile: {
                            year: lastTradeFile.getUTCFullYear(),
                            month: (lastTradeFile.getUTCMonth() + 1),
                            days: lastTradeFile.getUTCDate(),
                            hours: lastTradeFile.getUTCHours(),
                            minutes: lastTradeFile.getUTCMinutes()
                        },
                        monthCompleted: isMonthComplete
                    };

                    let fileContent = JSON.stringify(statusReport); 

                    statusReport.save(onSaved);

                    function onSaved(err) {

                        if (FULL_LOG === true) { logger.write("[INFO] start -> writeStatusReport -> onSaved -> Entering function."); }

                        if (err.result !== global.DEFAULT_OK_RESPONSE.result) {
                            logger.write("[ERROR] start -> writeStatusReport -> onSaved -> err = " + err.message);
                            callBackFunction(err);
                            return;
                        }

                        callBack(global.DEFAULT_OK_RESPONSE);
                    }
                }
                catch (err) {
                    logger.write("[ERROR] start -> writeStatusReport -> err = " + err.message);
                    callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                }
            }
        }
        catch (err) {
            logger.write("[ERROR] start -> err = " + err.message);
            callBackFunction(global.DEFAULT_FAIL_RESPONSE);
        }
    }
};
