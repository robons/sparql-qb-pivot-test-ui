import { DimensionValue, getData, getDataStructureDefinition, ObservedValue, Component } from "./query"

const tableContainer = window.document.getElementById("tableContainer");
const nextButton = window.document.getElementById("nextButton");
const currentPageNumberSpan = window.document.getElementById("pageNumberDisplay");
const dataSetSelection = <HTMLFormElement>window.document.getElementById("dataSet");

let currentEndPointComponents: Component[]
let currentPage: number

const sparqlEndPointUri = "https://staging.gss-data.org.uk/sparql"

const main = async () => {  
    dataSetSelection.onchange = (event: Event) => {
        setDataSet(sparqlEndPointUri, dataSetSelection.value)
        .then(() => console.log(`Set dataset URI to ${dataSetSelection.value}`))
        .catch(console.error)
    }

    await setDataSet(sparqlEndPointUri, dataSetSelection.value)
}

const setDataSet = async (sparqlEndPoint: string, dataSetUri: string) => {
    currentPage = 1
    currentEndPointComponents = await getDataStructureDefinition(
        dataSetUri,
        sparqlEndPoint
    )
    
    console.log(currentEndPointComponents)

    nextButton.onclick = () => nextPageClick(sparqlEndPoint, dataSetUri)

    await renderPageResults(sparqlEndPoint, dataSetUri, currentPage)
}

const nextPageClick = (sparqlEndPoint: string, dataSetUri: string) => {
    const nextPage = currentPage + 1
    renderPageResults(sparqlEndPoint, dataSetUri, nextPage)
        .then(() => {
            currentPage = nextPage
            console.log(`Page ${nextPage} render complete`)
        })
        .catch(console.error)
}

const renderPageResults = async (sparqlEndPoint: string, dataSetUri: string, pageNumber: number) => {
    console.log(`Fetching page ${pageNumber}`)
    const data = await getData(
        dataSetUri,
        sparqlEndPoint,
        currentEndPointComponents,
        pageNumber
    )
    console.log(data)

    // Clean out table container if there's anything in there.
    // tableContainer.childNodes.forEach(n => n.remove())
    tableContainer.innerHTML = `
        <table>
            <thead>
                ${
                    data.keys
                        .map(
                            k => `<th>${k}</th>`
                        )
                        .join("\n")
                }
            </thead>

            <tbody>
                ${
                    data.data
                        .map(
                            record => `
                                <tr>
                                ${
                                    data.keys
                                        .map(k => `<td>${mapColumnValueToHtml(record[k])}</td>`)
                                        .join("\n")
                                }
                                </tr>
                            `
                        )
                        .join("\n")
                }
            </tbody>
        </table>
    `

    currentPageNumberSpan.innerHTML = `On page ${pageNumber}.`
}

const mapColumnValueToHtml = (columnValue: ObservedValue | any): string => {
    if (columnValue instanceof ObservedValue) {
        const unitAttribute = columnValue.getUnitAttributeValue()
        return `
            <span class="measured-value" title="${columnValue.uri}">
                ${columnValue.value}
                <span class="unit" title="${unitAttribute.uri}">
                    ${unitAttribute.value}
                </span>
            </span>
        `
    } else if (columnValue instanceof DimensionValue) {
        return `
            <span class="dimension-value" title="${columnValue.uri}">
            ${columnValue.value}
            </span>
        `
    } else if (typeof columnValue === "undefined") {
        return "-"
    }

    return columnValue
}

main()
    .then(() => console.log("FINISHED"))
    .catch(console.error);

