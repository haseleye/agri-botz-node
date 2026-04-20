
function isValidCity (timeZone) {
    try {
        new Intl.DateTimeFormat("en-US", { timeZone });
        return true;
    } catch {
        return false;
    }
}

function getTimeZoneOffset(timeZone) {

    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone,
        timeZoneName: "shortOffset",
    });

    const parts = formatter.formatToParts(new Date());
    const offsetPart = parts.find((part) => part.type === "timeZoneName")?.value;

    if (!offsetPart || offsetPart === "GMT") {
        return 0;
    }

    const match = offsetPart.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);

    if (!match) {
        throw new Error(`Offset parsing error`);
    }

    const sign = match[1] === "+" ? 1 : -1;
    const hours = Number(match[2]);
    const minutes = match[3] ? Number(match[3]) : 0;

    return sign * (hours + minutes / 60);
}

module.exports = {isValidCity, getTimeZoneOffset}