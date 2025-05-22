import { createNumericInput, ElemsWithData, getElementByIdOrError, updateElementsFromData } from "../common/html-utils";
import { getMinimumRangeFromHorizons, HorizonsParams, HorizonsResultRecord } from "../horizons";
import type { SavedPoint, State, TerrainLocationData } from "../state-types";
import { savePoints } from "../storage";
import { hidden } from "../styles/site.module.css";
import { certificateIcon, floppyDiskIcon, penIcon, trashIcon } from "./icons";

const tableRowContentHtml = `
  <td data-var="lon"></td>
  <td data-var="lat"></td>
  <td data-var="elev"></td>
  <td data-var="time"></td>
  <td data-var="dist"></td>
  <td data-var="earth">
    <a href="#" target="_blank" rel="noopener noreferrer">Open</a>
  </td>
  <td data-var="action">
    <button data-action="verify" aria-label="Verify with Horizons" title="Verify with Horizons">
      ${certificateIcon}
    </button>
    <button data-action="edit" aria-label="Edit" title="Edit">
      ${penIcon}
    </button>
    <button data-action="delete" aria-label="Delete" title="Delete">
      ${trashIcon}
    </button>
    <button data-action="save" aria-label="Save" title="Save">
      ${floppyDiskIcon}
    </button>
  </td>
`;

type TableRowElems = {
  tr: HTMLTableRowElement;
  lat: Element;
  lon: Element;
  elev: Element;
  time: Element;
  dist: Element;
  earthLink: HTMLAnchorElement;
  verifyBtn: HTMLButtonElement;
  editBtn: HTMLButtonElement;
  deleteBtn: HTMLButtonElement;
  saveBtn: HTMLButtonElement;
  verifyHandler: (() => void) | null;
  editHandler: (() => void) | null;
  deleteHandler: (() => void) | null;
  saveHandler: (() => void) | null;
};

function getTableRowElems(tr: HTMLTableRowElement): TableRowElems {
  const actionElem = tr.querySelector("td[data-var='action']")!;
  return {
    tr,
    lat: tr.querySelector("td[data-var='lat']")!,
    lon: tr.querySelector("td[data-var='lon']")!,
    elev: tr.querySelector("td[data-var='elev']")!,
    time: tr.querySelector("td[data-var='time']")!,
    dist: tr.querySelector("td[data-var='dist']")!,
    earthLink: tr.querySelector("td[data-var='earth'] a")!,
    verifyBtn: actionElem.querySelector("button[data-action='verify']")!,
    editBtn: actionElem.querySelector("button[data-action='edit']")!,
    deleteBtn: actionElem.querySelector("button[data-action='delete']")!,
    saveBtn: actionElem.querySelector("button[data-action='save']")!,
    verifyHandler: null,
    editHandler: null,
    deleteHandler: null,
    saveHandler: null,
  };
}

export function run(container: HTMLElement, state: State) {
  const initialLocationData = state.terrainLocationData.getValue();
  const savedPoints = state.savedPoints.getValue();
  const resources: ViewResources = {
    container,
    tableBody: getElementByIdOrError("summary-table-body"),
    rowDataItems: initialLocationData !== null ? [asEditingData(initialLocationData), ...savedPoints] : savedPoints,
    elementsWithData: [],
  };

  state.terrainLocationData.subscribe((data) => {
    if (data !== null) {
      const replaceFirstRow = resources.rowDataItems.length > 0 && isEditingData(resources.rowDataItems[0]);
      if (replaceFirstRow) {
        resources.rowDataItems[0] = asEditingData(data);
      } else {
        resources.rowDataItems.unshift(asEditingData(data));
      }
    }

    runWithData(state, resources);
  });

  runWithData(state, resources);

  function asEditingData(candidateData: TerrainLocationData): EditingData {
    return {
      optimalDate: candidateData.optimalDate,
      longitudeDegrees: candidateData.longitudeDegrees,
      latitudeDegrees: candidateData.latitudeDegrees,
      altitudeInM: candidateData.altitudeInM,
      horizonsResultRecord: null,
      previouslySavedPoint: null,
    };
  }
}

function runWithData(state: State, resources: ViewResources) {
  if (resources.rowDataItems.length === 0) {
    resources.container.classList.add(hidden);
    return;
  }

  resources.container.classList.remove(hidden);

  refreshFromData();

  function refreshFromData() {
    resources.elementsWithData = updateElementsFromData(
      resources.elementsWithData,
      resources.rowDataItems,
      resources.tableBody,
      (elems) => elems.tr,
      createTableRowWithData
    );
  }

  function createTableRowWithData(data: RowData): TableRowElems {
    const rowElems = createTableRow(resources.tableBody);
    if (isEditingData(data)) {
      setTableRowEditing(rowElems, data, handleValueChange, handleVerify, handleSave);
    } else {
      setTableRowSaved(rowElems, data, handleDelete, handleEdit);
    }
    return rowElems;
  }

  function handleValueChange(data: EditingData, rowElems: TableRowElems) {
    data.horizonsResultRecord = null;
    updateRowVerificationState(rowElems, data);
  }

  async function handleVerify(data: EditingData, rowElems: TableRowElems) {
    const result = await getVerifiedMinimumRange(data);
    if (result === null) {
      alert("Moon does not reach a minimum distance around this location and time.");
      return;
    }

    data.horizonsResultRecord = result;
    updateRowVerificationState(rowElems, data);
  }

  function handleSave(data: EditingData, rowElems: TableRowElems) {
    if (data.horizonsResultRecord === null) {
      throw new Error("Should not be able to save without verification record");
    }

    const newPoint: SavedPoint = {
      longitudeDegrees: data.longitudeDegrees,
      latitudeDegrees: data.latitudeDegrees,
      altitudeInM: data.altitudeInM,
      distanceToMoonInKm: data.horizonsResultRecord.range,
      idealUnixTime: data.horizonsResultRecord.date.getTime(),
    };

    const index = resources.rowDataItems.indexOf(data);
    if (index < 0) {
      throw new Error("Row data not found.");
    }

    resources.rowDataItems.splice(index, 1, newPoint);

    savePointsAndUpdate();

    setTableRowSaved(rowElems, newPoint, handleDelete, handleEdit);
  }

  function handleDelete(point: SavedPoint, rowElems: TableRowElems) {
    const index = resources.rowDataItems.indexOf(point);
    if (index === -1) {
      throw new Error("Point to delete not found");
    }

    resources.rowDataItems.splice(index, 1);

    savePointsAndUpdate();
  }

  function handleEdit(point: SavedPoint, rowElems: TableRowElems) {
    const editingData: EditingData = {
      longitudeDegrees: point.longitudeDegrees,
      latitudeDegrees: point.latitudeDegrees,
      altitudeInM: point.altitudeInM,
      optimalDate: new Date(point.idealUnixTime),
      horizonsResultRecord: null,
      previouslySavedPoint: point,
    };

    setTableRowEditing(rowElems, editingData, handleValueChange, handleVerify, handleSave);
  }

  function savePointsAndUpdate() {
    const toSave: SavedPoint[] = [];
    resources.rowDataItems.forEach((d) => {
      if (isEditingData(d) && d.previouslySavedPoint !== null) {
        toSave.push(d.previouslySavedPoint);
      } else if (!isEditingData(d)) {
        toSave.push(d);
      }
    });

    savePoints(toSave);
    state.savedPoints.setValue(toSave);

    refreshFromData();
  }
}

function createTableRow(tableBody: Element): TableRowElems {
  const trElem = document.createElement("tr");
  trElem.innerHTML = tableRowContentHtml;
  tableBody.appendChild(trElem);
  return getTableRowElems(trElem);
}

function setTableRowEditing(
  rowElems: TableRowElems,
  data: EditingData,
  handleValueChange: (data: EditingData, rowElems: TableRowElems) => void,
  handleVerify: (data: EditingData, rowElems: TableRowElems) => void,
  handleSave: (data: EditingData, rowElems: TableRowElems) => void
) {
  const lonInput = createNumericInput(data.longitudeDegrees, -180, 180, 6, (val) => {
    data.longitudeDegrees = val;
    handleValueChange(data, rowElems);
  });

  const latInput = createNumericInput(data.latitudeDegrees, -90, 90, 6, (val) => {
    data.latitudeDegrees = val;
    handleValueChange(data, rowElems);
  });

  const elevInput = createNumericInput(data.altitudeInM, 0, 9000, 0, (val) => {
    data.altitudeInM = val;
    handleValueChange(data, rowElems);
  });

  rowElems.lon.replaceChildren(lonInput);
  rowElems.lat.replaceChildren(latInput);
  rowElems.elev.replaceChildren(elevInput);
  rowElems.earthLink.href = getGoogleEarthLink(
    data.longitudeDegrees,
    data.latitudeDegrees,
    data.altitudeInM,
    EarthViewMode.ExploreArea
  );

  if (rowElems.verifyHandler !== null) {
    rowElems.verifyBtn.removeEventListener("click", rowElems.verifyHandler);
  }

  if (rowElems.saveHandler !== null) {
    rowElems.saveBtn.removeEventListener("click", rowElems.saveHandler);
  }

  rowElems.verifyHandler = () => handleVerify(data, rowElems);
  rowElems.saveHandler = () => handleSave(data, rowElems);

  rowElems.verifyBtn.addEventListener("click", rowElems.verifyHandler);
  rowElems.saveBtn.addEventListener("click", rowElems.saveHandler);

  rowElems.saveBtn.classList.add(hidden); // Assume not verified, initially
  rowElems.deleteBtn.classList.add(hidden);
  rowElems.editBtn.classList.add(hidden);
}

function setTableRowSaved(
  rowElems: TableRowElems,
  point: SavedPoint,
  handleDelete: (point: SavedPoint, rowElems: TableRowElems) => void,
  handleEdit: (point: SavedPoint, rowElems: TableRowElems) => void
) {
  rowElems.lon.textContent = `${point.longitudeDegrees.toFixed(6)} °`;
  rowElems.lat.textContent = `${point.latitudeDegrees.toFixed(6)} °`;
  rowElems.elev.textContent = `${Math.round(point.altitudeInM).toLocaleString()} m`;
  rowElems.time.textContent = new Date(point.idealUnixTime).toISOString();
  rowElems.dist.textContent = `${(Math.round(point.distanceToMoonInKm * 1000) / 1000).toLocaleString()}`;
  rowElems.earthLink.href = getGoogleEarthLink(
    point.longitudeDegrees,
    point.latitudeDegrees,
    point.altitudeInM,
    EarthViewMode.ViewPoint
  );
  rowElems.verifyBtn.classList.add(hidden);
  rowElems.saveBtn.classList.add(hidden);

  if (rowElems.deleteHandler !== null) {
    rowElems.deleteBtn.removeEventListener("click", rowElems.deleteHandler);
  }

  if (rowElems.editHandler !== null) {
    rowElems.editBtn.removeEventListener("click", rowElems.editHandler);
  }

  rowElems.deleteHandler = () => handleDelete(point, rowElems);
  rowElems.editHandler = () => handleEdit(point, rowElems);

  rowElems.deleteBtn.addEventListener("click", rowElems.deleteHandler);
  rowElems.editBtn.addEventListener("click", rowElems.editHandler);
}

function updateRowVerificationState(rowElems: TableRowElems, data: EditingData) {
  const resultRecord = data.horizonsResultRecord;
  rowElems.time.textContent = resultRecord !== null ? resultRecord.date.toISOString() : "";
  rowElems.dist.textContent =
    resultRecord !== null ? `${(Math.round(resultRecord.range * 1000) / 1000).toLocaleString()}` : "";

  if (resultRecord !== null) {
    rowElems.verifyBtn.classList.add(hidden);
    rowElems.saveBtn.classList.remove(hidden);
  } else {
    rowElems.verifyBtn.classList.remove(hidden);
    rowElems.saveBtn.classList.add(hidden);
  }
}

enum EarthViewMode {
  ExploreArea,
  ViewPoint,
}

function getGoogleEarthLink(
  longitudeDegrees: number,
  latitudeDegrees: number,
  altitudeInM: number,
  mode: EarthViewMode
): string {
  const lat = latitudeDegrees.toFixed(6);
  const lon = longitudeDegrees.toFixed(6);
  const alt = altitudeInM.toFixed();

  let camDist: number;
  let tilt: number;
  switch (mode) {
    case EarthViewMode.ExploreArea:
      camDist = 50000;
      tilt = 70;
      break;
    case EarthViewMode.ViewPoint:
      camDist = 1000;
      tilt = 0;
  }

  return `https://earth.google.com/web/@${lat},${lon},${alt}a,${camDist}d,${tilt}t`;
}

async function getVerifiedMinimumRange(data: EditingData): Promise<HorizonsResultRecord | null> {
  const horizonsParams: HorizonsParams = {
    date: data.optimalDate,
    timeWindowSeconds: 60 * 30, // 15 minutes each side
    sampleCount: 128,
    longitudeDegrees: data.longitudeDegrees,
    latitudeDegrees: data.latitudeDegrees,
    altitudeInM: data.altitudeInM,
  };

  return await getMinimumRangeFromHorizons(horizonsParams);
}

type ViewResources = {
  container: HTMLElement;
  tableBody: HTMLElement;
  rowDataItems: RowData[];
  elementsWithData: ElemsWithData<TableRowElems, RowData>[];
};

type RowData = EditingData | SavedPoint;

type EditingData = Pick<TerrainLocationData, "optimalDate" | "longitudeDegrees" | "latitudeDegrees" | "altitudeInM"> & {
  horizonsResultRecord: HorizonsResultRecord | null;
  previouslySavedPoint: SavedPoint | null;
};

function isEditingData(data: RowData): data is EditingData {
  return (data as EditingData).horizonsResultRecord !== undefined;
}
