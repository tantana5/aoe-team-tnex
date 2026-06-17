/** Tiện ích xử lý CSV dùng chung (đọc từ Google Sheet export, v.v.). */

/** Parse một dòng CSV, tôn trọng field có dấu nháy kép. */
export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
  }
  result.push(cur);
  return result;
}

/** Tách toàn bộ nội dung CSV thành mảng 2 chiều (dòng -> các ô).
 * Xử lý đúng trường hợp ô có dấu nháy kép chứa ký tự xuống dòng (\n) hoặc dấu phẩy,
 * nên không bị lệch dòng khi một ô trải dài qua nhiều dòng vật lý. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cur);
      cur = "";
    } else if (ch === "\n" || ch === "\r") {
      // bỏ qua \n của cặp \r\n
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else {
      cur += ch;
    }
  }

  // dòng cuối (nếu file không kết thúc bằng newline)
  if (cur !== "" || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }

  return rows;
}

/** Chuyển chuỗi sang số (chấp nhận dấu phẩy thập phân), trả null nếu rỗng/không hợp lệ. */
export function parseNum(raw: string): number | null {
  const s = (raw ?? "").trim();
  if (s === "") return null;
  const n = Number(s.replace(",", "."));
  return Number.isNaN(n) ? null : n;
}
