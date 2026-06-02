const { Pool } = require('pg');

// Initialize Postgres Connection Pool
const userName = process.env.POSTGRES_USERNAME;
const password = process.env.POSTGRES_PASSWORD;
const pool = new Pool({
    connectionString: `postgresql://${userName}:${password}@datalake.aleria.com:5432/EHAwRfHpSW`
});

// ======================================
// ETL Runner Class (State Encapsulation)
// ======================================
class TenderETLRunner {
    constructor(params) {
        // Input Parameters
        this.fusionInstance = (params.fusionInstance || "").trim();
        this.userId = (params.userId || "").trim();
        this.password = params.password || "";
        this.reportPath = params.reportPath || "";
        this.tenderNumber = params.tenderNumber || "";
        this.allRounds = params.allRounds === "" ? "0" : String(params.allRounds);
        this.fromDate = params.from || "";
        this.toDate = params.to || "";

        // Truncate Flag
        this.truncateFirst = params.truncateTable === "1";

        // Map Report Path to Target Table & Primary Key
        const reportFilename = this.reportPath.split('/').pop();
        switch (reportFilename) {
            case 'GetTenderRequirementsReport.xdo':
                this.targetTable = 'Tender_Requirements';
                this.primaryKey = 'REQUIREMENT_ID';
                break;
            case 'GetTenderResponseRequirementsReport.xdo':
                this.targetTable = 'Tender_Response_Requirements';
                this.primaryKey = 'REQUIREMENT_ID';
                break;
            case 'GetAuctionResponseAllAttachmentsReport.xdo':
                this.targetTable = 'Tender_Response_Attachments';
                this.primaryKey = 'ATTACHMENT_ID';
                break;
            default:
                throw new Error(`Unsupported report name provided: ${reportFilename}`);
        }

        // Pagination State
        this.offset = 0;
        this.limitLevels = [600, 500, 400, 300, 200, 100, 80, 60, 40, 20, 10, 1];
        this.limitLevelIndex = 0;
        this.limit = this.limitLevels[this.limitLevelIndex];
        this.hasMore = true;
        this.lowestLevelRowsRemaining = 0;

        // Fetch Error State
        this.lastFetchErrorIsTerminal = false;
        this.lastFetchErrorText = "";
        this.errorText = "";

        // Schema & CSV State
        this.separator = ';';
        this.headers = [];
        this.keepIndex = [];
        this.parameters = ["P_OFFSET", "P_LIMIT", "P_TENDER_NUMBER", "P_ALL_ROUNDS", "P_FROM_DATE", "P_TO_DATE"];
        this.schemaSet = false;

        // Metrics
        this.totalRowsInserted = 0;
    }

    async run() {
        if (this.allRounds !== "0" && this.allRounds !== "1") {
            throw new Error("All Rounds value should be 0 for current round only, or 1 for all rounds");
        }

        // Execute Truncate if requested
        if (this.truncateFirst) {
            console.log(`Truncating table "${this.targetTable}"...`);
            await pool.query(`TRUNCATE TABLE "${this.targetTable}"`);
        }

        while (this.hasMore) {
            let pageRows = await this.loadNextPage();

            if (pageRows && pageRows.length > 0) {
                await this.insertIntoDatabase(pageRows);
            }

            if (this.errorText !== "") {
                throw new Error(this.errorText);
            }
        }

        return this.totalRowsInserted;
    }

    async loadNextPage() {
        while (true) {
            let currentOffset = this.offset;
            let currentLimit = this.limit;

            let nextCSV = await this.fetchReportPage(currentOffset, currentLimit);

            if (nextCSV === null) {
                if (this.lastFetchErrorIsTerminal) return null;

                this.handleFetchFailure(currentOffset, currentLimit);
                this.errorText = ""; // Clear and retry with lower limit
                continue;
            }

            this.errorText = "";
            nextCSV = nextCSV.replace(/^(?:\uFEFF|ï»¿)/, ""); // Strip BOM
            let lines = this.parseCSVRows(nextCSV);

            if (!lines || lines.length <= 1) {
                this.hasMore = false;
                return null;
            }

            let pageRows = [];

            if (!this.schemaSet) {
                let firstLineStr = lines[0].toString();
                let noResponse = firstLineStr === 'P_OFFSET;P_LIMIT;P_TENDER_NUMBER;P_ALL_ROUNDS;P_FROM_DATE;P_TO_DATE';

                if (noResponse || lines.length === 0) {
                    this.errorText = "No rows returned!";
                    return null;
                }

                this.headers = this.parseCSVLine(lines[0]);

                // Compute kept columns
                this.keepIndex = [];
                for (let i = 0; i < this.headers.length; i++) {
                    let h = this.headers[i].trim();
                    let exclude = this.parameters.some(p => h.toUpperCase() === p.toUpperCase());
                    if (!exclude) this.keepIndex.push(i);
                }

                pageRows = lines.length > 1 ? lines.slice(1) : [];
                pageRows = this.filterEmptyLines(pageRows);
                this.schemaSet = true;
            } else {
                // Align columns by header name for subsequent pages
                let nextHeader = this.parseCSVLine(lines[0]);
                let headerMap = {};
                for (let i = 0; i < nextHeader.length; i++) {
                    headerMap[nextHeader[i].trim()] = i;
                }

                let colMap = [];
                for (let j = 0; j < this.headers.length; j++) {
                    let name = this.headers[j].trim();
                    colMap[j] = (name in headerMap) ? headerMap[name] : -1;
                }

                let newData = lines.slice(1);
                let aligned = [];
                for (let r = 0; r < newData.length; r++) {
                    let fields = this.parseCSVLine(newData[r]);
                    let reordered = [];
                    for (let k = 0; k < this.headers.length; k++) {
                        let idx = colMap[k];
                        reordered.push(idx >= 0 && idx < fields.length ? fields[idx] : "");
                    }
                    aligned.push(reordered.join(this.separator));
                }

                pageRows = this.filterEmptyLines(aligned);
            }

            if (pageRows.length === 0) {
                this.hasMore = false;
                return null;
            }

            this.handleFetchSuccess(currentOffset, currentLimit, pageRows.length);
            return pageRows;
        }
    }

    async insertIntoDatabase(pageRows) {
        if (pageRows.length === 0) return;

        // 1. Build Base Column Identifiers
        const dbColumns = this.keepIndex.map(i => `"${this.headers[i].trim()}"`);
        const values = [];
        const placeholders = [];
        let paramIdx = 1;

        // 2. Build Value Matrix
        for (let r = 0; r < pageRows.length; r++) {
            let fields = this.parseCSVLine(pageRows[r]);
            let rowPlaceholders = [];

            for (let i = 0; i < this.keepIndex.length; i++) {
                let colIdx = this.keepIndex[i];
                values.push(colIdx < fields.length ? fields[colIdx] : null);
                rowPlaceholders.push(`$${paramIdx++}`);
            }
            placeholders.push(`(${rowPlaceholders.join(', ')})`);
        }

        // 3. Build Postgres UPSERT (ON CONFLICT) Clause
        // We dynamically update every column EXCEPT the Primary Key
        const updateSet = dbColumns
            .filter(col => col.replace(/"/g, '') !== this.primaryKey)
            .map(col => `${col} = EXCLUDED.${col}`)
            .join(', ');

        const conflictClause = updateSet.length > 0
            ? `ON CONFLICT ("${this.primaryKey}") DO UPDATE SET ${updateSet}`
            : `ON CONFLICT ("${this.primaryKey}") DO NOTHING`;

        const query = `INSERT INTO "${this.targetTable}" (${dbColumns.join(', ')}) VALUES ${placeholders.join(', ')} ${conflictClause}`;

        // Execute Bulk Upsert
        await pool.query(query, values);
        this.totalRowsInserted += pageRows.length;
        console.log(`Processed ${pageRows.length} rows into ${this.targetTable}. Total so far: ${this.totalRowsInserted}`);
    }

    async fetchReportPage(p_offset, p_limit) {
        this.lastFetchErrorIsTerminal = false;
        this.lastFetchErrorText = "";

        const soapUrl = `${this.fusionInstance}/xmlpserver/services/PublicReportService`;
        const soapBody = `<?xml version="1.0" encoding="utf-8"?>
        <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:pub="http://xmlns.oracle.com/oxp/service/PublicReportService">
            <soapenv:Header/>
            <soapenv:Body>
                <pub:runReport>
                    <pub:reportRequest>
                        <pub:reportAbsolutePath>/${this.xmlEscape(this.reportPath)}</pub:reportAbsolutePath>
                        <pub:attributeFormat>csv</pub:attributeFormat>
                        <pub:sizeOfDataChunkDownload>-1</pub:sizeOfDataChunkDownload>
                        <pub:parameterNameValues>
                            <pub:item><pub:name>p_tender_number</pub:name><pub:values><pub:item>${this.xmlEscape(this.tenderNumber)}</pub:item></pub:values></pub:item>
                            <pub:item><pub:name>p_all_rounds</pub:name><pub:values><pub:item>${this.xmlEscape(this.allRounds)}</pub:item></pub:values></pub:item>
                            <pub:item><pub:name>p_offset</pub:name><pub:values><pub:item>${p_offset}</pub:item></pub:values></pub:item>
                            <pub:item><pub:name>p_limit</pub:name><pub:values><pub:item>${p_limit}</pub:item></pub:values></pub:item>
                            <pub:item><pub:name>p_from_date</pub:name><pub:values><pub:item>${this.xmlEscape(this.fromDate)}</pub:item></pub:values></pub:item>
                            <pub:item><pub:name>p_to_date</pub:name><pub:values><pub:item>${this.xmlEscape(this.toDate)}</pub:item></pub:values></pub:item>
                        </pub:parameterNameValues>
                    </pub:reportRequest>
                    <pub:userID>${this.xmlEscape(this.userId)}</pub:userID>
                    <pub:password>${this.xmlEscape(this.password)}</pub:password>
                </pub:runReport>
            </soapenv:Body>
        </soapenv:Envelope>`;

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 300000); // 300 seconds max

            const response = await fetch(soapUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/xml;charset=UTF-8',
                    'SOAPAction': 'runReport'
                },
                body: soapBody,
                signal: controller.signal
            });

            clearTimeout(timeout);
            const responseText = await response.text();

            if (!response.ok) {
                this.lastFetchErrorIsTerminal = [401, 403, 404].includes(response.status);
                this.errorText = `HTTP Error ${response.status}: ${responseText.substring(0, 200)}`;
                return null;
            }

            const match = responseText.match(/<reportBytes>([\s\S]*?)<\/reportBytes>/);
            if (!match) {
                this.lastFetchErrorText = "Invalid response: reportBytes tag not found.";
                this.errorText = this.lastFetchErrorText;
                return null;
            }

            return Buffer.from(match[1], 'base64').toString('utf8');

        } catch (error) {
            this.lastFetchErrorText = error.message;
            this.errorText = "SOAP transport error: " + error.message;
            return null;
        }
    }

    // ==============================
    // Pagination & CSV Helpers
    // ==============================
    getLimitLevelIndex(value) {
        for (let i = 0; i < this.limitLevels.length; i++) {
            if (this.limitLevels[i] === value) return i;
        }
        return 0;
    }

    handleFetchFailure(failedOffset, failedLimit) {
        console.warn(`Data retrieval failed at offset=${failedOffset}, limit=${failedLimit}. Lowering limit.`);
        if (failedLimit === 1) {
            this.offset = failedOffset + 1;
            if (this.lowestLevelRowsRemaining > 0) this.lowestLevelRowsRemaining--;

            this.limitLevelIndex = this.getLimitLevelIndex(this.lowestLevelRowsRemaining <= 0 ? 10 : 1);
            this.limit = this.limitLevels[this.limitLevelIndex];
            this.hasMore = true;
            return;
        }

        if (failedLimit === 10) {
            this.limitLevelIndex = this.getLimitLevelIndex(1);
            this.limit = this.limitLevels[this.limitLevelIndex];
            this.lowestLevelRowsRemaining = 10;
            this.hasMore = true;
            return;
        }

        if (this.limitLevelIndex < this.limitLevels.length - 1) this.limitLevelIndex++;
        this.limit = this.limitLevels[this.limitLevelIndex];
        this.hasMore = true;
    }

    handleFetchSuccess(successOffset, successLimit, rowsCount) {
        if (successLimit === 1) {
            this.offset = successOffset + 1;
            if (this.lowestLevelRowsRemaining > 0) this.lowestLevelRowsRemaining--;

            this.limitLevelIndex = this.getLimitLevelIndex(this.lowestLevelRowsRemaining <= 0 ? 10 : 1);
            this.limit = this.limitLevels[this.limitLevelIndex];
            this.hasMore = true;
            return;
        }

        this.hasMore = (rowsCount >= successLimit);
        if (this.hasMore) {
            this.offset = successOffset + successLimit;
            if (this.limitLevelIndex > 0) this.limitLevelIndex--;
            this.limit = this.limitLevels[this.limitLevelIndex];
        }
    }

    parseCSVRows(data) {
        let lines = data.split(/\r?\n/);
        let rows = [];
        let current = "";
        let insideQuotes = false;

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            if (current.length > 0) current += "\n";
            current += line;
            let quoteCount = (line.match(/"/g) || []).length;
            if (quoteCount % 2 !== 0) insideQuotes = !insideQuotes;
            if (!insideQuotes) {
                rows.push(current);
                current = "";
            }
        }
        if (current.trim() !== "") rows.push(current);
        return rows;
    }

    parseCSVLine(line) {
        let result = [];
        let current = "";
        let insideQuotes = false;
        for (let i = 0; i < line.length; i++) {
            let c = line.charAt(i);
            if (c === '"') {
                if (insideQuotes && i + 1 < line.length && line.charAt(i + 1) === '"') {
                    current += '"'; i++;
                } else {
                    insideQuotes = !insideQuotes;
                }
            } else if (c === this.separator && !insideQuotes) {
                result.push(current);
                current = "";
            } else {
                current += c;
            }
        }
        result.push(current);
        return result;
    }

    filterEmptyLines(linesArr) {
        let out = [];
        for (let i = 0; i < linesArr.length; i++) {
            let ln = linesArr[i];
            if (!ln) continue;
            let tmp = ln.replace(new RegExp("\\" + this.separator, "g"), "").trim();
            if (tmp !== "") out.push(ln);
        }
        return out;
    }

    xmlEscape(str) {
        if (str === null || str === undefined) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&apos;");
    }
}

module.exports = TenderETLRunner;