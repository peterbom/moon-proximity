import { createNumericInput, ElemsWithData, getElementByIdOrError, updateElementsFromData } from "../common/html-utils";
import { toFriendlyUTC } from "../common/text-utils";
import { getMinimumRangeFromHorizons, HorizonsParams, HorizonsResultRecord } from "../horizons";
import type { SavedPoint, State, TerrainLocationData } from "../state-types";
import { savePoints } from "../storage";
import { hidden } from "../styles/site.module.css";
import { certificateIcon, floppyDiskIcon, penIcon, trashIcon } from "./icons";

const googleEarthPrefix = "https://earth.google.com/web/@";

const tableRowContentHtml = `
  <td data-label="Longitude" data-var="lon"></td>
  <td data-label="Latitude" data-var="lat"></td>
  <td data-label="Elevation" data-var="elev"></td>
  <td data-label="Ideal Time" data-var="time"></td>
  <td data-label="Distance" data-var="dist"></td>
  <td data-label="Google Earth" data-var="earth">
    <a href="#" target="_blank" rel="noopener noreferrer">Open</a>
  </td>
  <td data-label="Action" data-var="action">
    <button data-action="verify" aria-label="Verify with Horizons" title="Verify with Horizons">
      ${certificateIcon}
      Verify
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
  pasteHandler: ((e: ClipboardEvent) => void) | null;
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
    pasteHandler: null,
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
    resources.rowDataItems.sort((a, b) =>
      isEditingData(a) || isEditingData(b) ? 0 : a.distanceToMoonInKm - b.distanceToMoonInKm
    );

    resources.elementsWithData = updateElementsFromData(
      resources.elementsWithData,
      resources.rowDataItems,
      resources.tableBody,
      (elems) => elems.tr,
      createTableRowWithData
    );
  }

  function createTableRowWithData(data: RowData): TableRowElems {
    const trElem = document.createElement("tr");
    trElem.innerHTML = tableRowContentHtml;
    const rowElems = getTableRowElems(trElem);

    if (isEditingData(data)) {
      setTableRowEditing(rowElems, data, handleValueChange, handlePaste, handleVerify, handleSave);
    } else {
      setTableRowSaved(rowElems, data, handleDelete, handleEdit);
    }
    return rowElems;
  }

  function handleValueChange(data: EditingData, rowElems: TableRowElems) {
    data.horizonsResultRecord = null;
    updateRowVerificationState(rowElems, data);
  }

  function handlePaste(data: EditingData, rowElems: TableRowElems, urlComponents: EarthUrlComponents) {
    data.horizonsResultRecord = null;
    data.longitudeDegrees = urlComponents.lon;
    data.latitudeDegrees = urlComponents.lat;
    data.altitudeInM = urlComponents.alt;
    rowElems.lon.querySelector("input")!.value = urlComponents.lon.toFixed(6);
    rowElems.lat.querySelector("input")!.value = urlComponents.lat.toFixed(6);
    rowElems.elev.querySelector("input")!.value = urlComponents.alt.toFixed(0);
    handleVerify(data, rowElems);
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

  function handleDelete(point: SavedPoint) {
    const index = resources.rowDataItems.indexOf(point);
    if (index === -1) {
      throw new Error("Point to delete not found");
    }

    resources.rowDataItems.splice(index, 1);

    savePointsAndUpdate();
  }

  function handleEdit(point: SavedPoint, rowElems: TableRowElems) {
    const index = resources.rowDataItems.indexOf(point);
    if (index === -1) {
      throw new Error("Point to edit not found");
    }

    const editingData: EditingData = {
      longitudeDegrees: point.longitudeDegrees,
      latitudeDegrees: point.latitudeDegrees,
      altitudeInM: point.altitudeInM,
      optimalDate: new Date(point.idealUnixTime),
      horizonsResultRecord: null,
      previouslySavedPoint: point,
    };

    resources.rowDataItems.splice(index, 1, editingData);

    setTableRowEditing(rowElems, editingData, handleValueChange, handlePaste, handleVerify, handleSave);
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

function setTableRowEditing(
  rowElems: TableRowElems,
  data: EditingData,
  handleValueChange: (data: EditingData, rowElems: TableRowElems) => void,
  handlePaste: (data: EditingData, rowElems: TableRowElems, urlComponents: EarthUrlComponents) => void,
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

  if (rowElems.pasteHandler !== null) {
    rowElems.tr.removeEventListener("paste", rowElems.pasteHandler);
  }

  if (rowElems.verifyHandler !== null) {
    rowElems.verifyBtn.removeEventListener("click", rowElems.verifyHandler);
  }

  if (rowElems.saveHandler !== null) {
    rowElems.saveBtn.removeEventListener("click", rowElems.saveHandler);
  }

  rowElems.pasteHandler = createGoogleEarthPasteHandler(data, rowElems, handlePaste);
  rowElems.verifyHandler = () => handleVerify(data, rowElems);
  rowElems.saveHandler = () => handleSave(data, rowElems);

  rowElems.tr.addEventListener("paste", rowElems.pasteHandler);
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
  rowElems.lon.textContent = `${point.longitudeDegrees.toFixed(6)}°`;
  rowElems.lat.textContent = `${point.latitudeDegrees.toFixed(6)}°`;
  rowElems.elev.textContent = `${Math.round(point.altitudeInM).toLocaleString()} m`;
  rowElems.time.textContent = toFriendlyUTC(new Date(point.idealUnixTime));
  rowElems.dist.textContent = `${(Math.round(point.distanceToMoonInKm * 1000) / 1000).toLocaleString()} km`;
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
  rowElems.time.textContent = resultRecord !== null ? toFriendlyUTC(resultRecord.date) : "";
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

  return createGoogleEarthUrl({ lat: latitudeDegrees, lon: longitudeDegrees, alt: altitudeInM, camDist, tilt });
}

function createGoogleEarthUrl(components: EarthUrlComponents): string {
  const { lat, lon, alt, camDist, tilt } = components;
  return `${googleEarthPrefix}${lat.toFixed(6)},${lon.toFixed(6)},${alt.toFixed()}a,${camDist}d,${tilt}t`;
}

function parseGoogleEarthUrl(url: string): EarthUrlComponents | null {
  if (!url.startsWith(googleEarthPrefix)) {
    return null;
  }

  url = url.slice(googleEarthPrefix.length);
  const slashIndex = url.indexOf("/");
  if (slashIndex >= 0) {
    url = url.slice(0, slashIndex);
  }

  const parts = url.split(",");
  const lat = parseFloat(parts.shift() || "");
  const lon = parseFloat(parts.shift() || "");
  const alt = getPart("a");
  const camDist = getPart("d");
  const tilt = getPart("t");

  function getPart(suffix: string): number {
    for (const part of parts) {
      const index = part.indexOf(suffix);
      if (index > 0) {
        return parseFloat(part.slice(0, index));
      }
    }

    return NaN;
  }

  if (Number.isNaN(lat) || Number.isNaN(lon) || Number.isNaN(alt)) {
    return null;
  }

  return { lat, lon, alt, camDist, tilt };
}

type EarthUrlComponents = {
  lat: number;
  lon: number;
  alt: number;
  camDist: number;
  tilt: number;
};

async function getVerifiedMinimumRange(data: EditingData): Promise<HorizonsResultRecord | null> {
  const minutesEachSide = 15;
  const horizonsParams: HorizonsParams = {
    date: data.optimalDate,
    timeWindowSeconds: 60 * minutesEachSide * 2,
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

function createGoogleEarthPasteHandler(
  data: EditingData,
  rowElems: TableRowElems,
  handler: (data: EditingData, rowElems: TableRowElems, urlComponents: EarthUrlComponents) => void
): (e: ClipboardEvent) => void {
  return handlePaste;

  function handlePaste(e: ClipboardEvent) {
    const text = e.clipboardData?.getData("text") || "";
    if (text.length === 0) {
      return;
    }

    const urlComponents = parseGoogleEarthUrl(text);
    if (urlComponents !== null) {
      handler(data, rowElems, urlComponents);
    }
  }
}
