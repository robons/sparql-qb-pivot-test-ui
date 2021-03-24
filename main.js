define(["require", "exports", "./query"], function (require, exports, query_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    const tableContainer = window.document.getElementById("tableContainer");
    const nextButton = window.document.getElementById("nextButton");
    const previousButton = window.document.getElementById("previousButton");
    const currentPageNumberSpan = window.document.getElementById("pageNumberDisplay");
    const dataSetSelection = window.document.getElementById("dataSet");
    let currentEndPointComponents;
    let currentPage;
    const sparqlEndPointUri = "https://staging.gss-data.org.uk/sparql";
    const main = async () => {
        // Find out which multi-measure datasets we have available
        const dataSets = await query_1.getMultiMeasureDataSets(sparqlEndPointUri);
        dataSetSelection.innerHTML = dataSets
            .map(ds => `<option value="${ds.uri}">${ds.label}</option>`)
            .join("\n");
        dataSetSelection.onchange = (event) => {
            setDataSet(sparqlEndPointUri, dataSetSelection.value)
                .then(() => console.log(`Set dataset URI to ${dataSetSelection.value}`))
                .catch(console.error);
        };
        await setDataSet(sparqlEndPointUri, dataSets[0].uri);
    };
    const setDataSet = async (sparqlEndPoint, dataSetUri) => {
        currentPage = 1;
        currentEndPointComponents = await query_1.getDataStructureDefinition(dataSetUri, sparqlEndPoint);
        console.log(currentEndPointComponents);
        previousButton.onclick = () => pageChangeClick(sparqlEndPoint, dataSetUri, currentPage - 1);
        nextButton.onclick = () => pageChangeClick(sparqlEndPoint, dataSetUri, currentPage + 1);
        await renderPageResults(sparqlEndPoint, dataSetUri, currentPage);
    };
    const pageChangeClick = (sparqlEndPoint, dataSetUri, pageToFetch) => {
        pageToFetch = Math.max(0, pageToFetch);
        renderPageResults(sparqlEndPoint, dataSetUri, pageToFetch)
            .then(() => {
            currentPage = pageToFetch;
            console.log(`Page ${pageToFetch} render complete`);
        })
            .catch(console.error);
    };
    const renderPageResults = async (sparqlEndPoint, dataSetUri, pageNumber) => {
        console.log(`Fetching page ${pageNumber}`);
        const data = await query_1.getData(dataSetUri, sparqlEndPoint, currentEndPointComponents, pageNumber);
        console.log(data);
        // Clean out table container if there's anything in there.
        // tableContainer.childNodes.forEach(n => n.remove())
        tableContainer.innerHTML = `
        <table>
            <thead>
                ${data.columns
            .map(c => `<th>
                                <span title="${c.key}">${c.label}</span>
                            </th>`)
            .join("\n")}
            </thead>

            <tbody>
                ${data.data
            .map(record => `
                                <tr>
                                ${data.columns
            .map(c => `<td>${mapColumnValueToHtml(record[c.key])}</td>`)
            .join("\n")}
                                </tr>
                            `)
            .join("\n")}
            </tbody>
        </table>
    `;
        currentPageNumberSpan.innerHTML = `On page ${pageNumber}.`;
    };
    const mapColumnValueToHtml = (columnValue) => {
        if (columnValue instanceof query_1.ObservedValue) {
            const unitAttribute = columnValue.getUnitAttributeValue();
            return `
            <span class="measured-value" title="${columnValue.uri}">
                ${columnValue.value}
                <span class="unit" title="${unitAttribute.uri}">
                    ${unitAttribute.value}
                </span>
            </span>
        `;
        }
        else if (columnValue instanceof query_1.DimensionValue) {
            return `
            <span class="dimension-value" title="${columnValue.uri}">
            ${columnValue.value}
            </span>
        `;
        }
        else if (typeof columnValue === "undefined") {
            return "-";
        }
        return columnValue;
    };
    main()
        .then(() => console.log("FINISHED"))
        .catch(console.error);
});
