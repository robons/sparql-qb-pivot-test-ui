import { DimensionValue, getData, getDataStructureDefinition, getMultiMeasureDataSets, ObservedValue, Component } from "./query"

const tableContainer = window.document.getElementById("tableContainer");
const nextButton = window.document.getElementById("nextButton");
const previousButton = window.document.getElementById("previousButton");
const currentPageNumberSpan = window.document.getElementById("pageNumberDisplay");
const dataSetSelection = <HTMLFormElement>window.document.getElementById("dataSet");

let currentEndPointComponents: Component[]
let currentPage: number

const sparqlEndPointUri = "https://staging.gss-data.org.uk/sparql"

const main = async () => {  
    // Find out which multi-measure datasets we have available
    const dataSets = await getMultiMeasureDataSets(sparqlEndPointUri);
    dataSetSelection.innerHTML = dataSets
        .map(ds => `<option value="${ds.uri}">${ds.label}</option>`)
        .join("\n")

    dataSetSelection.onchange = (event: Event) => {
        setDataSet(sparqlEndPointUri, dataSetSelection.value)
        .then(() => console.log(`Set dataset URI to ${dataSetSelection.value}`))
        .catch(console.error)
    }

    await setDataSet(sparqlEndPointUri, dataSets[0].uri)
}

const setDataSet = async (sparqlEndPoint: string, dataSetUri: string) => {
    currentPage = 1
    currentEndPointComponents = await getDataStructureDefinition(
        dataSetUri,
        sparqlEndPoint
    )
    
    console.log(currentEndPointComponents)

    previousButton.onclick = () => pageChangeClick(sparqlEndPoint, dataSetUri, currentPage-1)
    nextButton.onclick = () => pageChangeClick(sparqlEndPoint, dataSetUri, currentPage+1)

    await renderPageResults(sparqlEndPoint, dataSetUri, currentPage)
}

const pageChangeClick = (sparqlEndPoint: string, dataSetUri: string, pageToFetch: number) => {
    pageToFetch = Math.max(1, pageToFetch);
    renderPageResults(sparqlEndPoint, dataSetUri, pageToFetch)
        .then(() => {
            currentPage = pageToFetch
            console.log(`Page ${pageToFetch} render complete`)
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
                    data.columns
                        .map(
                            c => `<th>
                                <span title="${c.key}">${c.label}</span>
                            </th>`
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
                                    data.columns
                                        .map(c => `<td>${mapColumnValueToHtml(record[c.key])}</td>`)
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

