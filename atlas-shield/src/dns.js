const DNS_HEADER_LENGTH = 12;
const TYPE_A = 1;
const TYPE_AAAA = 28;
const CLASS_IN = 1;

function readName(message, initialOffset, visited = new Set()) {
  let offset = initialOffset;
  let nextOffset = null;
  const labels = [];

  while (true) {
    if (offset >= message.length) throw new Error("Truncated DNS name");
    if (visited.has(offset)) throw new Error("DNS compression pointer loop");
    visited.add(offset);

    const length = message[offset];
    if (length === 0) {
      if (nextOffset === null) nextOffset = offset + 1;
      break;
    }

    if ((length & 0xc0) === 0xc0) {
      if (offset + 1 >= message.length) throw new Error("Truncated DNS pointer");
      const pointer = ((length & 0x3f) << 8) | message[offset + 1];
      if (pointer >= message.length) throw new Error("Invalid DNS pointer");
      if (nextOffset === null) nextOffset = offset + 2;
      offset = pointer;
      continue;
    }

    if ((length & 0xc0) !== 0 || length > 63 || offset + 1 + length > message.length) {
      throw new Error("Invalid DNS label");
    }

    labels.push(message.subarray(offset + 1, offset + 1 + length).toString("ascii"));
    offset += length + 1;
  }

  return { name: labels.join(".").toLowerCase(), nextOffset };
}

export function parseQuestion(message) {
  if (!Buffer.isBuffer(message) || message.length < DNS_HEADER_LENGTH) {
    throw new Error("DNS message is too short");
  }

  const questionCount = message.readUInt16BE(4);
  if (questionCount !== 1) throw new Error("Exactly one DNS question is required");

  const parsedName = readName(message, DNS_HEADER_LENGTH);
  if (parsedName.nextOffset + 4 > message.length) throw new Error("Truncated DNS question");

  return {
    name: parsedName.name,
    type: message.readUInt16BE(parsedName.nextOffset),
    class: message.readUInt16BE(parsedName.nextOffset + 2),
    endOffset: parsedName.nextOffset + 4
  };
}

function responseFlags(message, responseCode = 0) {
  const queryFlags = message.readUInt16BE(2);
  return 0x8000 | 0x0080 | (queryFlags & 0x7910) | (responseCode & 0x000f);
}

export function buildErrorResponse(query, responseCode = 2) {
  if (query.length < DNS_HEADER_LENGTH) return null;
  const response = Buffer.alloc(DNS_HEADER_LENGTH);
  query.copy(response, 0, 0, 2);
  response.writeUInt16BE(responseFlags(query, responseCode), 2);
  return response;
}

export function buildBlockedResponse(query, question, ttlSeconds = 60) {
  const hasAddressAnswer = question.class === CLASS_IN &&
    (question.type === TYPE_A || question.type === TYPE_AAAA);
  const addressLength = question.type === TYPE_A ? 4 : 16;
  const answerLength = hasAddressAnswer ? 12 + addressLength : 0;
  const response = Buffer.alloc(question.endOffset + answerLength);

  query.copy(response, 0, 0, question.endOffset);
  response.writeUInt16BE(responseFlags(query), 2);
  response.writeUInt16BE(1, 4);
  response.writeUInt16BE(hasAddressAnswer ? 1 : 0, 6);
  response.writeUInt16BE(0, 8);
  response.writeUInt16BE(0, 10);

  if (hasAddressAnswer) {
    let offset = question.endOffset;
    response.writeUInt16BE(0xc00c, offset);
    offset += 2;
    response.writeUInt16BE(question.type, offset);
    offset += 2;
    response.writeUInt16BE(CLASS_IN, offset);
    offset += 2;
    response.writeUInt32BE(Math.max(0, ttlSeconds), offset);
    offset += 4;
    response.writeUInt16BE(addressLength, offset);
    // Buffer.alloc already fills the A or AAAA value with zero bytes.
  }

  return response;
}

export function encodeQuery(name, type = TYPE_A, id = 1) {
  const labels = name.replace(/\.$/, "").split(".");
  const encodedLabels = labels.map((label) => {
    const bytes = Buffer.from(label, "ascii");
    if (!bytes.length || bytes.length > 63) throw new Error("Invalid DNS label");
    return Buffer.concat([Buffer.from([bytes.length]), bytes]);
  });
  const questionName = Buffer.concat([...encodedLabels, Buffer.from([0])]);
  const message = Buffer.alloc(DNS_HEADER_LENGTH + questionName.length + 4);
  message.writeUInt16BE(id, 0);
  message.writeUInt16BE(0x0100, 2);
  message.writeUInt16BE(1, 4);
  questionName.copy(message, DNS_HEADER_LENGTH);
  message.writeUInt16BE(type, DNS_HEADER_LENGTH + questionName.length);
  message.writeUInt16BE(CLASS_IN, DNS_HEADER_LENGTH + questionName.length + 2);
  return message;
}
