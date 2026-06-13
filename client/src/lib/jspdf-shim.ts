declare global {
  interface Window {
    jspdf: any;
  }
}

let _loadPromise: Promise<void> | null = null;

function loadScripts(): Promise<void> {
  if (_loadPromise) return _loadPromise;
  _loadPromise = new Promise<void>((resolve, reject) => {
    if (window.jspdf?.jsPDF) { resolve(); return; }
    const s1 = document.createElement("script");
    s1.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    s1.onload = () => {
      const s2 = document.createElement("script");
      s2.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js";
      s2.onload = () => resolve();
      s2.onerror = () => reject(new Error("Failed to load jspdf-autotable from CDN"));
      document.head.appendChild(s2);
    };
    s1.onerror = () => reject(new Error("Failed to load jspdf from CDN"));
    document.head.appendChild(s1);
  });
  return _loadPromise;
}

export async function initJsPDF(opts?: any): Promise<any> {
  await loadScripts();
  return new window.jspdf.jsPDF(opts);
}

export class jsPDF {
  [key: string]: any;

  constructor(opts?: any) {
    Object.defineProperty(this, "__opts", { value: opts, writable: true });
    Object.defineProperty(this, "__doc", { value: null, writable: true });
    Object.defineProperty(this, "__ready", {
      value: loadScripts().then(() => {
        (this as any).__doc = new window.jspdf.jsPDF(opts);
      }),
      writable: false,
    });

    return new Proxy(this, {
      get(target: any, prop: string) {
        if (prop in target) return target[prop];
        const doc = target.__doc;
        if (doc && prop in doc) {
          const val = doc[prop];
          if (typeof val === "function") return val.bind(doc);
          return val;
        }
        return undefined;
      },
      set(target: any, prop: string, value: any) {
        const doc = target.__doc;
        if (doc && prop in doc) { doc[prop] = value; return true; }
        target[prop] = value;
        return true;
      },
    });
  }
}

export async function autoTable(doc: any, opts: any): Promise<void> {
  await loadScripts();
  if (doc && typeof doc.autoTable === "function") {
    doc.autoTable(opts);
  }
}

export default jsPDF;
