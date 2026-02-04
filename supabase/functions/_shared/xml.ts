type XmlContainer = Document | Element;

export const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const decodeXmlEntities = (value: string) => {
  const decodedWithoutAmpersand = value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
  return decodedWithoutAmpersand.replaceAll("&amp;", "&");
};

const elementToObject = (element: Element): Record<string, unknown> => {
  const children = Array.from(element.children);
  if (!children.length) {
    return { value: element.textContent?.trim() ?? "" };
  }
  return children.reduce<Record<string, unknown>>((result, child) => {
    const key = child.tagName;
    const value =
      child.children.length > 0
        ? elementToObject(child)
        : child.textContent?.trim() ?? "";
    if (key in result) {
      const existing = result[key];
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        result[key] = [existing, value];
      }
    } else {
      result[key] = value;
    }
    return result;
  }, {});
};

const parseEmbeddedXml = (content: string) => {
  const decoded = decodeXmlEntities(content);
  if (!decoded.includes("<")) {
    return null;
  }
  const parsed = new DOMParser().parseFromString(decoded, "application/xml");
  if (!parsed || parsed.getElementsByTagName("parsererror").length > 0) {
    return null;
  }
  return parsed;
};

const extractItems = (
  root: XmlContainer,
  tags: string[],
): Record<string, unknown>[] => {
  for (const tag of tags) {
    const nodes = Array.from(root.getElementsByTagName(tag));
    if (nodes.length) {
      return nodes.map((node) => elementToObject(node));
    }
  }

  const container = root instanceof Document ? root.documentElement : root;
  const directChildren = container ? Array.from(container.children) : [];
  return directChildren.map((node) => elementToObject(node));
};

const findResultNode = (document: Document, tags: string[]) => {
  for (const tag of tags) {
    const node = document.getElementsByTagName(tag)[0];
    if (node) {
      return node;
    }
  }
  return null;
};

export const parseXmlResponse = (
  xml: string,
  resultTags: string[],
  itemTags: string[],
): { error?: string; items?: Record<string, unknown>[] } => {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (!document || document.getElementsByTagName("parsererror").length > 0) {
    return { error: "Unable to parse XML response" };
  }

  const errorNode = document.getElementsByTagName("Error")[0] ??
    document.getElementsByTagName("Fault")[0];
  const faultString = document.getElementsByTagName("faultstring")[0];
  const message = errorNode?.textContent?.trim() ??
    faultString?.textContent?.trim();
  if (message) {
    return { error: message };
  }

  let root: XmlContainer = document;
  const resultNode = findResultNode(document, resultTags);
  const resultContent = resultNode?.textContent?.trim();
  if (resultNode && resultContent) {
    const embedded = parseEmbeddedXml(resultContent);
    root = embedded ?? resultNode;
  }

  return { items: extractItems(root, itemTags) };
};
