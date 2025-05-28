/*
Greg Miller (gmiller@gregmiller.net) 2022
Released as public domain
http://www.celestialprogramming.com/

Class to read binary versions of JPL's Development Ephemeris.  Files in
the propper format can be obtained from:
ftp://ssd.jpl.nasa.gov/pub/eph/planets/Linux

#    Properties       Units          Center Description
0    x,y,z            km             SSB    Mercury
1    x,y,z            km             SSB    Venus
2    x,y,z            km             SSB    Earth-Moon barycenter
3    x,y,z            km             SSB    Mars
4    x,y,z            km             SSB    Jupiter
5    x,y,z            km             SSB    Saturn
6    x,y,z            km             SSB    Uranus
7    x,y,z            km             SSB    Neptune
8    x,y,z            km             SSB    Pluto
9    x,y,z            km             Earth  Moon (geocentric)
10   x,y,z            km             SSB    Sun
11   dPsi,dEps        radians               Earth Nutations in longitude and obliquity
12   phi,theta,psi    radians               Lunar mantle libration
13   Ox,Oy,Oz         radians/day           Lunar mantle angular velocity
14   t                seconds               TT-TDB (at geocenter)

Example:
-----------------------------------------------
async function test(){
    data=await fetchJSON();
    const dv=new DataView(data);
    de=new JPLDE(dv);

    console.log(de.getPlanet(0,2451736.5));
}

async function fetchJSON() {
    const response = await fetch('jpleph2000-2040.405');
    const blob = await response.blob();
    const data= await blob.arrayBuffer();
    return data;
}

test();
*/

const seriesVars = [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 3, 3, 1];

export class JPLDE {
  public readonly data: DataView;
  private readonly littleEndian: boolean;
  private readonly header: JPLHeaderData;

  constructor(data: DataView) {
    this.littleEndian = true;
    this.data = data;
    this.header = JPLDEHeader.readHeader(data);
  }

  getHeader() {
    return this.header;
  }

  getEarthPositionFromEMB(emb: number[], moon: number[]) {
    const earth = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
    for (let i = 0; i < 6; i++) {
      earth[i] = emb[i] - moon[i] / (1.0 + this.header.emrat);
    }
    return earth;
  }

  getBlockForJD(jd: number) {
    const jdoffset = jd - this.header.jdStart;
    const blockNum = Math.floor(jdoffset / this.header.jdStep);

    const offset = blockNum * this.header.blockSize + 2 * this.header.blockSize;
    const block = new DataView(this.data.buffer, offset, this.header.blockSize);

    return block;
  }

  getPlanet(planet: number, jd: number) {
    const block = this.getBlockForJD(jd);
    const d = this.header.coeffPtr[planet];
    const seriesOffset = d[0] - 1;
    const ccount = d[1];
    const subint = d[2];
    const varCount = seriesVars[planet];

    const startJD = block.getFloat64(0, this.littleEndian);
    const endJD = block.getFloat64(8, this.littleEndian);
    const blockDuration = endJD - startJD;

    const subintervalDuration = Math.floor(blockDuration / subint);
    const subintervalSize = ccount * varCount;
    const subintervalNumber = Math.floor((jd - startJD) / subintervalDuration);
    const subintervalStart = subintervalDuration * subintervalNumber;
    const subintervalEnd = subintervalDuration * subintervalNumber + subintervalDuration;

    //Normalize time variable (x) to be in the range -1 to 1 over the given subinterval
    //If using two doubles for JD, this is where the two parts should be combined:
    //e.g. jd=(JD[0]-(startJD+subintervalStart))+JD[1]
    const x = ((jd - (startJD + subintervalStart)) / subintervalDuration) * 2 - 1;

    const properties = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < varCount; i++) {
      const offset = seriesOffset + i * ccount + subintervalSize * subintervalNumber;

      const coeff: number[] = new Array();
      for (let j = 0; j < ccount; j++) {
        coeff[j] = block.getFloat64(offset * 8 + j * 8, this.littleEndian);
      }

      const t = this.computePolynomial(x, coeff);
      properties[i] = t[0];

      let velocity = t[1];
      velocity = velocity * ((2.0 * subint) / blockDuration);
      properties[i + varCount] = velocity;
    }

    return properties;
  }

  computePolynomial(x: number, coefficients: number[]) {
    const t = new Array();
    //Equation 14.20 from Explanetory Supplement 3 rd ed.
    t[0] = 1.0;
    t[1] = x;

    for (let n = 2; n < coefficients.length; n++) {
      t[n] = 2 * x * t[n - 1] - t[n - 2];
    }

    //Multiply the polynomial by the coefficients.
    //Loop through coefficients backwards (from smallest to largest)to avoid floating point rounding errors
    let position = 0;
    for (let i = coefficients.length - 1; i >= 0; i--) {
      position += coefficients[i] * t[i];
    }

    //Compute velocity (just the derivitave of the above)
    const v = new Array();
    v[0] = 0.0;
    v[1] = 1.0;
    v[2] = 4.0 * x;
    for (let n = 3; n < coefficients.length; n++) {
      v[n] = 2 * x * v[n - 1] + 2 * t[n - 1] - v[n - 2];
    }

    let velocity = 0.0;
    for (let i = coefficients.length - 1; i >= 0; i--) {
      velocity += v[i] * coefficients[i];
    }

    const r = new Array();
    r[0] = position;
    r[1] = velocity;
    return r;
  }
}

export type JPLHeaderData = {
  //description: string;
  //startString: string;
  //endString: string;
  //constantNames: string[];
  jdStart: number;
  jdEnd: number;
  jdStep: number;
  //numConstants: number;
  //au: number;
  emrat: number;
  coeffPtr: [number, number, number][];
  //version: number;
  blockSize: number;
  //constants: number[];
};

class JPLDEHeader {
  static getString(dv: DataView, offset: number, length: number) {
    //Gets a string from a data view.
    let s = "";
    for (let i = 0; i < length; i++) {
      const v = dv.getUint8(offset + i);
      s += String.fromCharCode(v);
    }
    return s;
  }

  static findRecLength(coeffPtr: [number, number, number][]) {
    for (let i = coeffPtr.length - 1; i >= 0; i--) {
      if (coeffPtr[i][0] != 0) {
        const cp = coeffPtr[i];
        const reclen = cp[0] + cp[1] * cp[2] * seriesVars[i] - 1;
        return reclen * 8;
      }
    }
    throw new Error("Header info contains no coefficient offsets.");
  }

  //data parameter should be a DataView
  static readHeader(data: DataView): JPLHeaderData {
    const le = true; //Use little endian format

    const description = this.getString(data, 0, 84);
    const startString = this.getString(data, 84, 84);
    const endString = this.getString(data, 168, 84);

    const constantNames: string[] = [];
    for (let i = 0; i < 400; i++) {
      constantNames[i] = this.getString(data, 252 + i * 6, 6);
    }

    const jdStart = data.getFloat64(2652, le);
    const jdEnd = data.getFloat64(2660, le);
    const jdStep = data.getFloat64(2668, le);
    const numConstants = data.getUint32(2676, le);
    const au = data.getFloat64(2680, le);
    const emrat = data.getFloat64(2688, le);

    const coeffPtr: [number, number, number][] = [];
    // let t = [];
    //Group 1050 data
    for (let i = 0; i < 12; i++) {
      const t: [number, number, number] = [0, 0, 0];
      t[0] = data.getUint32(2696 + i * 3 * 4, le);
      t[1] = data.getUint32(2700 + i * 3 * 4, le);
      t[2] = data.getUint32(2704 + i * 3 * 4, le);
      coeffPtr[i] = t;
    }

    const version = data.getUint32(2840, le);

    //more Group 1050 data
    coeffPtr[coeffPtr.length] = [data.getUint32(2844, le), data.getUint32(2848, le), data.getUint32(2852, le)];

    let offset = 2856;
    //more constant names, if there's more than 400
    if (numConstants > 400) {
      for (let i = 0; i < numConstants - 400; i++) {
        constantNames[constantNames.length] = this.getString(data, 2856 + i * 6, 6);
      }
      offset = 2856 + (numConstants - 400) * 6;
    }

    //more Group 1050 data
    coeffPtr[coeffPtr.length] = [
      data.getUint32(offset, le),
      data.getUint32(offset + 4, le),
      data.getUint32(offset + 8, le),
    ];

    //more Group 1050 data
    coeffPtr[coeffPtr.length] = [
      data.getUint32(offset + 12, le),
      data.getUint32(offset + 16, le),
      data.getUint32(offset + 20, le),
    ];

    //Compute block size based on offsets in Group 1050
    const blockSize = this.findRecLength(coeffPtr);

    const constants = [];
    for (let i = 0; i < numConstants; i++) {
      constants[i] = data.getFloat64(blockSize + i * 8, le);
    }

    return {
      jdStart,
      jdEnd,
      jdStep,
      emrat,
      coeffPtr,
      blockSize,
    };
  }
}
