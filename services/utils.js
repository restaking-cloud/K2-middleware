function utf8ToHex(str) {
    return '0x' + Array.from(str).map(c =>
        c.charCodeAt(0) < 128 ? c.charCodeAt(0).toString(16) :
            encodeURIComponent(c).replace(/\%/g,'').toLowerCase()
    ).join('');
}

module.exports = {
    utf8ToHex
}