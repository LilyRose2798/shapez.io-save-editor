const { Menu, dialog } = require("electron").remote
const { readFile, writeFile } = require("fs").promises
const { compress, decompress } = require("./common")
const path = require("path")

const roamingFolder = process.env.APPDATA || (process.env.HOME + process.platform == "darwin" ? "/Library/Preferences" : "/.local/share")
let storePath = path.join(roamingFolder, "shapez.io", "saves")

const numRowButtons = 3
const buttonWidth = 32

const openFileButton = document.getElementById("openFile")
const saveFileButton = document.getElementById("saveFile")
const pageHeader = document.getElementById("header")
const editorDiv = document.getElementById("editor")
let json

const editorConfig = readFile("./editor-config.json").then(JSON.parse).catch(_ => {
    pageHeader.textContent = "Missing editor configuration (editor-config.json)"
    openFileButton.disabled = true
})

const resolvePath = (obj, path) => path.length === 0 ? obj : resolvePath(obj[path[0]], path.slice(1))

const getDefault = type => (type === "int" || type === "float") ? 0 : type === "string" ? "" : type === "shape" ? "--------" : undefined

const populatePath = (obj, path, type) => {
    const headPath = path[0]
    const restPath = path.slice(1)
    if (restPath.length === 0)
        obj[headPath] = getDefault(type)
    else
        populatePath(obj.hasOwnProperty(headPath) ? obj[headPath] : obj[headPath] = {}, restPath, type)
}

const getParser = type => type === "int" ? parseInt : type === "float" ? parseFloat : val => val

const setPath = (obj, path, val) => path.length === 1 ? obj[path] = val : setPath(obj[path[0]], path.slice(1), val)

const createLabel = (div, value) => {
    const label = document.createElement("label")
    label.textContent = value
    div.appendChild(label)
}

const createInput = (div, value, onchange) => {
    const input = document.createElement("input")
    if (value === null) {
        input.disabled = true
        input.value = "null"
    } else if (value === undefined) {
        input.disabled = true
        input.value = "undefined"
    } else
        input.value = value
    input.type = "text"
    input.spellcheck = false
    input.onchange = onchange
    div.appendChild(input)
}

const createAddButton = (div, onclick) => {
    const addRowButton = document.createElement("button")
    addRowButton.className = "add-button"
    addRowButton.innerHTML = "&#xe803;"
    addRowButton.onclick = onclick
    div.appendChild(addRowButton)
}

const createRemoveButton = (div, onclick) => {
    const removeRowButton = document.createElement("button")
    removeRowButton.className = "remove-button"
    removeRowButton.innerHTML = "&#xe802;"
    removeRowButton.onclick = onclick
    div.appendChild(removeRowButton)
}

const openFile = async () => {
    const res = await dialog.showOpenDialog({
        defaultPath: storePath,
        properties: ["openFile"],
        filters: [
            { name: "Compressed save file", extensions: ["bin"] },
            { name: "Decompressed save file", extensions: ["json"] }
        ]
    })
    if (!res.canceled) {
        const saveData = await readFile(res.filePaths[0])
        json = (res.filePaths[0].split(".").pop() === "json" ? JSON.parse : decompress)(saveData.toString())

        pageHeader.textContent = "shapez.io Save Editor"
        saveFileItem.enabled = true
        saveFileButton.disabled = false
        editorDiv.innerHTML = ""

        for (const group of await editorConfig) {
            const groupDiv = document.createElement("div")
            const groupHeader = document.createElement("h2")
            groupHeader.textContent = group.title
            editorDiv.appendChild(groupHeader)
            
            const groupObj = resolvePath(json, group.path)

            if (Array.isArray(groupObj)) {
                const createRowButtons = div => {
                    const moveUpButton = document.createElement("button")
                    moveUpButton.className = "move-button"
                    moveUpButton.innerHTML = "&#xe800;"
                    moveUpButton.onclick = () => {
                        if (div.dataset.index > 0) {
                            const tmp = groupObj[div.previousSibling.dataset.index]
                            groupObj[div.previousSibling.dataset.index] = groupObj[div.dataset.index]
                            groupObj[div.dataset.index] = tmp
                            div.dataset.index--
                            div.previousSibling.dataset.index++
                            groupDiv.insertBefore(div, div.previousSibling)
                        }
                    }
                    div.appendChild(moveUpButton)

                    const moveDownButton = document.createElement("button")
                    moveDownButton.className = "move-button"
                    moveDownButton.innerHTML = "&#xe801;"
                    moveDownButton.onclick = () => {
                        if (div.dataset.index < groupObj.length - 1) {
                            const tmp = groupObj[div.nextSibling.dataset.index]
                            groupObj[div.nextSibling.dataset.index] = groupObj[div.dataset.index]
                            groupObj[div.dataset.index] = tmp
                            div.dataset.index++
                            div.nextSibling.dataset.index--
                            groupDiv.insertBefore(div.nextSibling, div)
                        } 
                    }
                    div.appendChild(moveDownButton)

                    createRemoveButton(div, () => {
                        let curDiv = div.nextSibling
                        while(curDiv.dataset.index) {
                            curDiv.dataset.index--
                            curDiv = curDiv.nextSibling
                        }
                        groupDiv.removeChild(div)
                        groupObj.splice(div.dataset.index, 1)
                    })
                }

                if (group.type) {
                    groupDiv.className = "value-list-group"
                    groupDiv.style.gridTemplateColumns = `1fr repeat(${numRowButtons}, ${buttonWidth}px)`

                    const createRow = index => {
                        const valueDiv = document.createElement("div")
                        valueDiv.dataset.index = index
                        createInput(valueDiv, groupObj[index], ev =>
                            groupObj[valueDiv.dataset.index] = getParser(group.type)(ev.target.value))
                        createRowButtons(valueDiv)
                        groupDiv.insertBefore(valueDiv, groupDiv.lastChild)
                    }

                    const addRowDiv = document.createElement("div")
                    for (let i = 0; i < numRowButtons; i++)
                        createLabel(addRowDiv, "")
                    createAddButton(addRowDiv, () => createRow(groupObj.push(getDefault(group.type)) - 1))
                    groupDiv.appendChild(addRowDiv)

                    for (const index in groupObj)
                        createRow(index)
                } else if (group.fields) {
                    groupDiv.className = "object-list-group"
                    groupDiv.style.gridTemplateColumns = `${group.fields.map(field => `${field.width || "1"}fr`).join(" ")} repeat(${numRowButtons}, ${buttonWidth}px)`
                    const labelsDiv = document.createElement("div")
                    for (const column of group.fields)
                        createLabel(labelsDiv, column.label)
                    for (let i = 0; i < numRowButtons; i++)
                        createLabel(labelsDiv, "")
                    groupDiv.appendChild(labelsDiv)

                    const createRow = index => {
                        const objectDiv = document.createElement("div")
                        objectDiv.dataset.index = index
                        for (const field of group.fields)
                            createInput(objectDiv, resolvePath(groupObj[index], field.path), ev =>
                                setPath(groupObj[objectDiv.dataset.index], field.path, getParser(field.type)(ev.target.value)))
                        createRowButtons(objectDiv)
                        groupDiv.insertBefore(objectDiv, groupDiv.lastChild)
                    }
                    
                    const addRowDiv = document.createElement("div")
                    for (let i = 0; i < group.fields.length + numRowButtons - 1; i++)
                        createLabel(addRowDiv, "")
                    createAddButton(addRowDiv, () => {
                        const newObj = {}
                        for (const field of group.fields)
                            populatePath(newObj, field.path, field.type)
                            createRow(groupObj.push(newObj) - 1)
                    })
                    groupDiv.appendChild(addRowDiv)

                    for (const index in groupObj)
                        createRow(index)
                }
            } else if (group.type) {
                groupDiv.className = "value-group"
                createInput(groupDiv, groupObj, ev => setPath(json, group.path, getParser(group.type)(ev.target.value)))
            } else if (group.fields) {
                groupDiv.className = "fields-group"
                for (const field of group.fields) {
                    const fieldDiv = document.createElement("div")
                    createLabel(fieldDiv, field.label)
                    createInput(fieldDiv, resolvePath(groupObj, field.path), ev => setPath(groupObj, field.path, getParser(field.type)(ev.target.value)))
                    groupDiv.appendChild(fieldDiv)
                }
            } else if (group.key && group.value) {
                groupDiv.className = "object-group"
                groupDiv.style.gridTemplateColumns = `${group.key.width || "1"}fr ${group.value.width || "1"}fr ${buttonWidth}px`
                const labelsDiv = document.createElement("div")
                createLabel(labelsDiv, group.key.label)
                createLabel(labelsDiv, group.value.label)
                createLabel(labelsDiv, "")
                groupDiv.appendChild(labelsDiv)

                const createRow = key => {
                    const fieldDiv = document.createElement("div")
                    createInput(fieldDiv, key, ev => {
                        groupObj[ev.target.value] = groupObj[key]
                        delete groupObj[key]
                        key = ev.target.value
                    })
                    createInput(fieldDiv, groupObj[key], ev => groupObj[key] = getParser(group.value.type)(ev.target.value))
                    createRemoveButton(fieldDiv, () => {
                        groupDiv.removeChild(fieldDiv)
                        delete groupObj[key]
                    })
                    groupDiv.insertBefore(fieldDiv, groupDiv.lastChild)
                }

                const addRowDiv = document.createElement("div")
                createLabel(addRowDiv, "")
                createLabel(addRowDiv, "")
                createAddButton(addRowDiv, () => {
                    const key = getDefault(group.key.type)
                    groupObj[key] = getDefault(group.value.type)
                    createRow(key)
                })
                groupDiv.appendChild(addRowDiv)
                
                for (let key in groupObj)
                    createRow(key)
            }
            editorDiv.appendChild(groupDiv)
        }
        editorDiv.hidden = false
    }
}

const saveFile = async () => {
    const res = await dialog.showSaveDialog({ defaultPath: storePath })
    if (!res.canceled)
        await writeFile(res.filePath, (res.filePath.split(".").pop() === "json" ? JSON.stringify : compress)(json))
}

const menu = Menu.buildFromTemplate([
    {
        role: "fileMenu",
        submenu: [
            {
                id: "openFile",
                label: "Open",
                click: openFile
            },
            {
                id: "saveFile",
                label: "Save",
                enabled: false,
                click: saveFile
            },
            {
                role: "quit"
            }
        ]
    }
])
const saveFileItem = menu.getMenuItemById("saveFile")
Menu.setApplicationMenu(menu)

openFileButton.onclick = openFile
saveFileButton.onclick = saveFile
