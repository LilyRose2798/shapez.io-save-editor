const { createHash } = require("rusha")
const { decompressFromEncodedURIComponent: decompressX64, compressToEncodedURIComponent: compressX64 } = require("lz-string")

const compressionPrefix = String.fromCodePoint(1)
const salt = "Ec'])@^+*9zMevK3uMV4432x9%iK'="
const charmap = "!#%&'()*+,-./:;<=>?@[]^_`{|}~¥¦§¨©ª«¬­®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿABCDEFGHIJKLMNOPQRSTUVWXYZ"
let compressionCache = {}
let decompressionCache = {}

const sha1 = str => createHash().update(str).digest("hex")

const compressInt = i => {
    i += 1
    if (compressionCache[i])
        return compressionCache[i]
    let result = ""
    do {
        result += charmap[i % charmap.length]
        i = Math.floor(i / charmap.length)
    } while (i > 0)
    return (compressionCache[i] = result)
}

const decompressInt = s => {
    if (decompressionCache[s])
        return decompressionCache[s]
    s = "" + s
    let result = 0
    for (let i = s.length - 1; i >= 0; --i)
        result = result * charmap.length + charmap.indexOf(s.charAt(i))
    result -= 1
    return (decompressionCache[s] = result)
}

const compressObjectInternal = (obj, keys = [], values = []) => {
    if (Array.isArray(obj))
        return obj.map(x => compressObjectInternal(x, keys, values))
    else if (typeof obj === "object" && obj !== null)
        return Object.entries(obj).reduce((res, [key, value]) => {
            const index = keys.indexOf(key)
            res[compressInt(index < 0 ? keys.push(key) - 1 : index)] = compressObjectInternal(value, keys, values)
            return res
        }, {})
    else if (typeof obj === "string") {
        const index = values.indexOf(obj)
        return compressInt(index < 0 ? values.push(obj) - 1 : index)
    }
    return obj
}

const decompressObjectInternal = (obj, keys = [], values = []) => {
    if (Array.isArray(obj))
        return obj.map(x => decompressObjectInternal(x, keys, values))
    else if (typeof obj === "object" && obj !== null)
        return Object.entries(obj).reduce((res, [key, value]) => {
            res[keys[decompressInt(key)]] = decompressObjectInternal(value, keys, values)
            return res
        }, {})
    else if (typeof obj === "string")
        return values[decompressInt(obj)]
    return obj
}

const compressObject = obj => {
    compressionCache = {}
    const keys = []
    const values = []
    const data = compressObjectInternal(obj, keys, values)
    return { keys, values, data }
}

const decompressObject = obj => {
    decompressionCache = {}
    if (obj.keys && obj.values && obj.data) {
        const keys = obj.keys
        const values = obj.values
        const result = decompressObjectInternal(obj.data, keys, values)
        return result
    }
    return obj
}

exports.compress = obj => {
    const jsonStr = JSON.stringify(compressObject(obj))
    return compressionPrefix + compressX64(sha1(jsonStr + salt) + jsonStr)
}

exports.decompress = data => {
    const isCompressed = data.startsWith(compressionPrefix)
    const decompressed = isCompressed ? decompressX64(data.substr(compressionPrefix.length)) : data
    if (!decompressed)
        throw new Error("Decompression failed")
    if (decompressed.length < 40)
        throw new Error("Payload too small")
    const jsonStr = decompressed.substr(40)
    if (sha1(jsonStr + salt) !== decompressed.substring(0, 40))
        throw new Error("Checksum mismatch")
    return decompressObject(JSON.parse(jsonStr))
}
