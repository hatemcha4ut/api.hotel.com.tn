/**
 * XML utilities for myGO API
 * Simple XML builder and parser for Cloudflare Workers environment
 */

/**
 * Simple XML element wrapper
 */
export class SimpleXMLElement {
  constructor(
    public tagName: string,
    public textContent: string = "",
    public children: SimpleXMLElement[] = [],
  ) {}

  querySelector(selector: string): SimpleXMLElement | null {
    // Direct child search first
    for (const child of this.children) {
      if (child.tagName === selector) {
        return child;
      }
    }
    // Deep search
    for (const child of this.children) {
      const result = child.querySelector(selector);
      if (result) return result;
    }
    return null;
  }

  querySelectorAll(selector: string): SimpleXMLElement[] {
    const results: SimpleXMLElement[] = [];
    
    // Check all children recursively
    for (const child of this.children) {
      if (child.tagName === selector) {
        results.push(child);
      }
      // Also search in children of children
      results.push(...child.querySelectorAll(selector));
    }
    return results;
  }

  appendChild(child: SimpleXMLElement): void {
    this.children.push(child);
  }

  get documentElement(): SimpleXMLElement {
    return this;
  }
}

/**
 * Simple XML Document wrapper
 */
export class SimpleXMLDocument {
  documentElement: SimpleXMLElement;

  constructor() {
    this.documentElement = new SimpleXMLElement("Document");
  }

  querySelector(selector: string): SimpleXMLElement | null {
    return this.documentElement.querySelector(selector);
  }

  querySelectorAll(selector: string): SimpleXMLElement[] {
    return this.documentElement.querySelectorAll(selector);
  }
}

/**
 * Parse XML string into SimpleXMLDocument
 */
export const parseSimpleXml = (xmlString: string): SimpleXMLDocument => {
  const doc = new SimpleXMLDocument();
  
  // Tokenize XML
  const tokens: Array<{ type: string; name?: string; text?: string }> = [];
  const tokenRegex = /<\?[^?]*\?>|<!\[CDATA\[[^\]]*\]\]>|<!--[^-]*(?:-[^-]+)*-->|<\/([a-zA-Z_][a-zA-Z0-9_:-]*)>|<([a-zA-Z_][a-zA-Z0-9_:-]*)\s*\/?>|([^<]+)/g;
  
  let match;
  while ((match = tokenRegex.exec(xmlString)) !== null) {
    if (match[0].startsWith("<?") || match[0].startsWith("<!") || match[0].startsWith("<!--")) {
      // Skip declarations and comments
      continue;
    } else if (match[0].startsWith("</")) {
      // Closing tag
      tokens.push({ type: "close", name: match[1] });
    } else if (match[0].startsWith("<")) {
      // Opening tag (with or without self-close)
      const tagName = match[2];
      const isSelfClosing = match[0].endsWith("/>");
      tokens.push({ type: isSelfClosing ? "selfclose" : "open", name: tagName });
    } else {
      // Text content
      const text = match[3].trim();
      if (text.length > 0) {
        tokens.push({ type: "text", text });
      }
    }
  }

  // Build tree
  const stack: SimpleXMLElement[] = [];
  let currentElement: SimpleXMLElement | null = null;

  for (const token of tokens) {
    if (token.type === "open") {
      const element = new SimpleXMLElement(token.name!);
      if (currentElement) {
        currentElement.appendChild(element);
      } else {
        doc.documentElement = element;
      }
      stack.push(element);
      currentElement = element;
    } else if (token.type === "selfclose") {
      const element = new SimpleXMLElement(token.name!);
      if (currentElement) {
        currentElement.appendChild(element);
      } else {
        doc.documentElement = element;
      }
    } else if (token.type === "text") {
      if (currentElement) {
        currentElement.textContent = token.text!;
      }
    } else if (token.type === "close") {
      stack.pop();
      currentElement = stack.length > 0 ? stack[stack.length - 1] : null;
    }
  }

  return doc;
};

/**
 * Build XML string from JavaScript object
 */
export const buildXmlFromObject = (obj: Record<string, unknown>, rootTag = "Root"): string => {
  const escapeXml = (str: string): string => {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  };

  const buildNode = (key: string, value: unknown): string => {
    if (value === null || value === undefined) {
      return `<${key}/>`;
    }
    
    if (typeof value === "object" && !Array.isArray(value)) {
      const children = Object.entries(value as Record<string, unknown>)
        .map(([k, v]) => buildNode(k, v))
        .join("");
      return `<${key}>${children}</${key}>`;
    }
    
    if (Array.isArray(value)) {
      return value.map((item) => buildNode(key, item)).join("");
    }
    
    return `<${key}>${escapeXml(String(value))}</${key}>`;
  };

  const body = Object.entries(obj)
    .map(([key, value]) => buildNode(key, value))
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?><${rootTag}>${body}</${rootTag}>`;
};

/**
 * Convert XML to JSON-like object
 */
export const xmlToJson = (element: SimpleXMLElement): unknown => {
  // If element has no children, return text content
  if (element.children.length === 0) {
    return element.textContent || null;
  }

  // If element has children, build object
  const result: Record<string, unknown> = {};
  
  for (const child of element.children) {
    const childData = xmlToJson(child);
    
    if (result[child.tagName] !== undefined) {
      // Key already exists, convert to array
      if (!Array.isArray(result[child.tagName])) {
        result[child.tagName] = [result[child.tagName]];
      }
      (result[child.tagName] as unknown[]).push(childData);
    } else {
      result[child.tagName] = childData;
    }
  }

  return result;
};
