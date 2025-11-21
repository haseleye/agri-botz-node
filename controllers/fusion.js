const axios = require("axios");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const {generateUUID} = require('../utils/codeGenerator');
const { exec } = require("child_process");
const { spawn } = require("child_process");
const { Parser } = require("json2csv");
const oracledb = require('oracledb');

const clientId = "client-id";
const tenantId = "tenant-id";
const fusionRegion = "fusion-region";
const apiUser = "ald_aleria_int_usr";
const keyAlias = "aleria_proc_assertion_cert";

const getAccessToken = async (req, res) => {
    try {
        const privateKey = fs.readFileSync("private_key.pem", "utf8");
        const tokenEndpoint = `https://idcs-${tenantId}.identity.oraclecloud.com/oauth2/v1/token`;
        // const scope = `https://fa.${fusionRegion}.oraclecloud.com:443urn:opc:resource:consumer::all`;
        const scope = `urn:opc:resource:consumer::all`;

        const now = Math.floor(Date.now() / 1000);
        const payload = {
            iss: clientId,
            sub: apiUser,
            aud: "https://identity.oraclecloud.com/",
            iat: now,
            exp: now + 300,
            jti: generateUUID()
        };
        const header = {
            alg: "RS256",
            typ: "JWT",
            kid: keyAlias
        };

        const signedJWT = jwt.sign(payload, privateKey, {algorithm: "RS256"}, header);

        const params = new URLSearchParams();
        params.append("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
        params.append("assertion", signedJWT);
        params.append("scope", scope);

        await axios.post(tokenEndpoint, params, {
            headers: {"Content-Type": "application/x-www-form-urlencoded"}
        })
            .then((result) => {
                if (result.data.error === undefined) {
                    res.status(200).json({
                        status: "success",
                        error: "",
                        message: {
                            accessToken: result.data.access_token,
                            tokenType: result.data.token_type,
                            expiresIn: result.data.expires_in,
                            scope: result.data.scope
                        }
                    });
                }
                else {
                    res.status(400).json({
                        status: "failed",
                        error: `${result.data.error}: ${result.data.error_description}`,
                        message: {}
                    });
                }
            })
            .catch((err) => {
                res.status(500).json({
                    status: "failed",
                    error: `Something went wrong while calling IDCS. ${err}`,
                    message: {}
                });
            });
    }
    catch (err) {
        res.status(500).json({
            status: "failed",
            error: req.i18n.t('general.internalError'),
            message: {
                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
            }
        });
    }

    const PO = {
        "ProcurementBU": "Aldar Construction",
        // "DocumentNumber": "PO-100234",
        "RequisitioningBU": "Aldar Construction",
        "Supplier": "1004 GOURMET GENERAL TRADING LLC",
        // "SupplierSite": "Dubai",
        "Buyer": "vmanivasagam",
        "Currency": "AED",
        "POType": "Standard",
        "Lines": [
            {
                "LineNumber": 1,
                "LineType": "Service",
                // "Item": "AS54888",
                "ItemDescription": "Test Ehab",
                "Quantity": 5,
                "UnitPrice": 100,
                "UOM": "Each",
                "DeliverToLocation": "Seattle Warehouse",
                "Requester": "vmanivasagam",
                // "ChargeAccount": "01-200-7820-0000",
                // "Distributions": [
                //     {
                //         "DistributionNumber": 1,
                //         "QuantityOrdered": 5,
                //         "ChargeAccount": "01-200-7820-0000"
                //     }
                // ]
            }
        ]
    }

    const PR = {
        "RequisitioningBUName": "Vision Operations",
        "CurrencyCode": "AED",
        "Justification": "Test PR from Ehab",
        "RequestedBy": "Ehab Awad",
        "DeliverToLocationId": 300000045689123,
        "lines": [
            {
                "LineTypeId": 100000002345678,
                "ItemDescription": "Lenovo ThinkPad T14 Laptop",
                "Quantity": 5,
                "UnitPrice": 100,
                "UOMCode": "Each",
                "DestinationTypeCode": "EXPENSE",
                "DeliverToLocationId": 300000045689123,
                "DeliverToPersonId": 300000123456789,
                "CategoryId": 300000067891234
            }
        ]
    }


}

const getSuppliers = async (req, res) => {
    let allItems = [];
    const limit = 500;
    let offset = 0;
    let hasMore = true;

    try {
        while (hasMore) {
            const page = await fetchPage(offset, limit);
            if (page.items && page.items.length > 0) {
                allItems = allItems.concat(page.items);
            }
            hasMore = page.hasMore === true;
            offset += limit;
        }

        // ✅ Save to CSV
        if (allItems.length > 0) {
            // Collect all keys across all items (including nested ones flattened)
            const flatten = (obj, prefix = "") =>
                Object.keys(obj).reduce((acc, k) => {
                    const pre = prefix.length ? prefix + "." : "";
                    if (typeof obj[k] === "object" && obj[k] !== null) {
                        Object.assign(acc, flatten(obj[k], pre + k));
                    } else {
                        acc[pre + k] = obj[k];
                    }
                    return acc;
                }, {});

            const flattenedItems = allItems.map(item => flatten(item));
            const headers = Array.from(
                flattenedItems.reduce((set, obj) => {
                    Object.keys(obj).forEach(k => set.add(k));
                    return set;
                }, new Set())
            );

            const csvRows = [headers.join(",")];
            flattenedItems.forEach(obj => {
                const row = headers.map(h => {
                    const val = obj[h] !== undefined ? obj[h] : "";
                    // wrap in quotes if contains comma or newline
                    return typeof val === "string" && /[,"\n]/.test(val)
                        ? `"${val.replace(/"/g, '""')}"`
                        : val;
                });
                csvRows.push(row.join(","));
            });

            fs.writeFileSync("items.csv", csvRows.join("\n"));
        }

        // ✅ Return full JSON response in API
        res.status(200).json({
            status: "success",
            error: "",
            message: {
                totalItems: allItems.length,
                result: allItems
            }
        });
    } catch (err) {
        res.status(500).json({
            status: "failed",
            error: err.message,
            message: {}
        });
    }
};

const fetchPage = async (offset, limit) => {
    return new Promise((resolve, reject) => {
        const url = `https://ewnp-dev2.fa.ocs.oraclecloud.com/fscmRestApi/resources/latest/items?limit=${limit}&offset=${offset}`;

        const curl = spawn("curl", [
            "-s",
            "-u", "ald_aleria_int_usr:g3f17d4c_A02b6883d",
            "-X", "GET",
            url,
            "-H", "Content-Type: application/vnd.oracle.adf.resourceitem+json"
        ]);

        let data = "";

        curl.stdout.on("data", chunk => { data += chunk; });
        curl.stderr.on("data", chunk => console.error(`stderr: ${chunk}`));

        curl.on("close", () => {
            try {
                const result = JSON.parse(data);
                resolve(result);
            } catch (err) {
                reject(new Error("JSON parse error: " + err.message));
            }
        });
    });
};

module.exports = {getAccessToken, getSuppliers};