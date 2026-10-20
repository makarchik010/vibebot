// Вставь ID своей таблицы между кавычками ниже 👇
const SPREADSHEET_ID = 'https://script.google.com/macros/s/AKfycbyf7taWVt-_lN6bJpUeCPRsI9VlJQpK1xw4UeoR6EKrutali-y2UQXRicxYF2DfIocf/exec';

function getSS() {
  if (SPREADSHEET_ID && SPREADSHEET_ID.length > 10) {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function FIX_MY_TABLE() {
  const ss = getSS();
  const sheetProd = ss.getSheetByName('Товары');
  const sheetDeliv = ss.getSheetByName('Доставка');
  
  if (!sheetProd || !sheetDeliv) {
    Logger.log('ОШИБКА: Листы не найдены!');
    return;
  }
  
  const lastRow = Math.max(sheetProd.getLastRow(), sheetDeliv.getLastRow());
  if (lastRow < 3) return;
  
  const numRows = lastRow - 2;

  sheetProd.getRange(3, 7, numRows, 1).setFormulaR1C1('=RC[-2]*RC[-1]');
  sheetProd.getRange(3, 9, numRows, 1).setFormulaR1C1('=IFERROR(VLOOKUP(RC[-8], Доставка!C1:C8, 8, FALSE), 0)');
  sheetProd.getRange(3, 10, numRows, 1).setFormulaR1C1('=RC[-3]+RC[-1]');
  sheetProd.getRange(3, 13, numRows, 1).setFormulaR1C1('=IF(RC[-1]="Продано", RC[-2]-RC[-3], "")');

  sheetProd.getRange("E2").setFormulaR1C1('=SUM(R[1]C:R[500]C)');
  sheetProd.getRange("G2").setFormulaR1C1('=SUM(R[1]C:R[500]C)');
  sheetProd.getRange("H2").setFormulaR1C1('=SUM(R[1]C:R[500]C)');
  sheetProd.getRange("I2").setFormulaR1C1('=SUM(R[1]C:R[500]C)');
  sheetProd.getRange("J2").setFormulaR1C1('=SUM(R[1]C:R[500]C)');
  sheetProd.getRange("K2").setFormulaR1C1('=SUM(R[1]C:R[500]C)');
  sheetProd.getRange("M2").setFormulaR1C1('=SUM(R[1]C:R[500]C)');

  sheetDeliv.getRange(3, 1, numRows, 1).setFormulaR1C1('=Товары!RC');
  sheetDeliv.getRange(3, 2, numRows, 1).setFormulaR1C1('=Товары!RC');
  sheetDeliv.getRange(3, 3, numRows, 1).setFormulaR1C1('=Товары!RC');
  sheetDeliv.getRange(3, 4, numRows, 1).setFormulaR1C1('=Товары!RC[4]');
  
  sheetDeliv.getRange(3, 5, numRows, 1).setFormulaR1C1('=IFERROR(RC[-1]/SUMIFS(C4, C3, RC[-2])*VLOOKUP(RC[-2], Накладные!C1:C3, 2, FALSE), 0)');
  sheetDeliv.getRange(3, 6, numRows, 1).setFormulaR1C1('=IFERROR(RC[-2]/SUMIFS(C4, C3, RC[-3])*VLOOKUP(RC[-3], Накладные!C1:C3, 3, FALSE), 0)');
  sheetDeliv.getRange(3, 7, numRows, 1).setFormulaR1C1('=IFERROR(RC[-3]/SUMIFS(C4, C3, RC[-4])*VLOOKUP(RC[-4], Накладные!C1:C5, 5, FALSE), 0)');
  sheetDeliv.getRange(3, 8, numRows, 1).setFormulaR1C1('=RC[-2]+RC[-1]');

  sheetDeliv.getRange("D2").setFormulaR1C1('=SUM(R[1]C:R[500]C)');
  sheetDeliv.getRange("E2").setFormulaR1C1('=SUM(R[1]C:R[500]C)');
  sheetDeliv.getRange("F2").setFormulaR1C1('=SUM(R[1]C:R[500]C)');
  sheetDeliv.getRange("G2").setFormulaR1C1('=SUM(R[1]C:R[500]C)');
  sheetDeliv.getRange("H2").setFormulaR1C1('=SUM(R[1]C:R[500]C)');

  SpreadsheetApp.flush();
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(15000);
  
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return response({ status: 'error', error: 'Пустой запрос' });
    }

    const data = JSON.parse(e.postData.contents);
    const ss = getSS();
    
    if (data.action === 'add_product') {
      const sheetProd = ss.getSheetByName('Товары');
      const sheetDeliv = ss.getSheetByName('Доставка');
      
      if (!sheetProd || !sheetDeliv) {
        return response({ status: 'error', error: 'Не найден лист "Товары" или "Доставка"' });
      }
      
      const lastRow = Math.max(sheetProd.getLastRow() + 1, 3);
      const nextId = lastRow - 2;

      sheetProd.appendRow([
        nextId, data.name, data.batch, data.sourceDest, data.cnyPrice, data.rate,
        '', data.weight, '', '', '', 'В пути', ''
      ]);

      sheetProd.getRange(lastRow, 7).setFormulaR1C1('=RC[-2]*RC[-1]');
      sheetProd.getRange(lastRow, 9).setFormulaR1C1('=IFERROR(VLOOKUP(RC[-8], Доставка!C1:C8, 8, FALSE), 0)');
      sheetProd.getRange(lastRow, 10).setFormulaR1C1('=RC[-3]+RC[-1]');
      sheetProd.getRange(lastRow, 13).setFormulaR1C1('=IF(RC[-1]="Продано", RC[-2]-RC[-3], "")');

      sheetDeliv.appendRow(['', '', '', '', '', '', '', '']);
      sheetDeliv.getRange(lastRow, 1).setFormulaR1C1('=Товары!RC');
      sheetDeliv.getRange(lastRow, 2).setFormulaR1C1('=Товары!RC');
      sheetDeliv.getRange(lastRow, 3).setFormulaR1C1('=Товары!RC');
      sheetDeliv.getRange(lastRow, 4).setFormulaR1C1('=Товары!RC[4]');
      sheetDeliv.getRange(lastRow, 5).setFormulaR1C1('=IFERROR(RC[-1]/SUMIFS(C4, C3, RC[-2])*VLOOKUP(RC[-2], Накладные!C1:C3, 2, FALSE), 0)');
      sheetDeliv.getRange(lastRow, 6).setFormulaR1C1('=IFERROR(RC[-2]/SUMIFS(C4, C3, RC[-3])*VLOOKUP(RC[-3], Накладные!C1:C3, 3, FALSE), 0)');
      sheetDeliv.getRange(lastRow, 7).setFormulaR1C1('=IFERROR(RC[-3]/SUMIFS(C4, C3, RC[-4])*VLOOKUP(RC[-4], Накладные!C1:C5, 5, FALSE), 0)');
      sheetDeliv.getRange(lastRow, 8).setFormulaR1C1('=RC[-2]+RC[-1]');

      return response({ status: 'ok', id: nextId, row: lastRow });
    }
    
    if (data.action === 'add_cargo') {
      const sheet = ss.getSheetByName('Накладные');
      if (!sheet) return response({ status: 'error', error: 'Лист "Накладные" не найден' });
      
      const lastRow = sheet.getLastRow();
      let rowFound = -1;
      if (lastRow > 1) {
        const values = sheet.getRange(1, 1, lastRow, 1).getValues();
        for (let i = 1; i < values.length; i++) {
          if (String(values[i][0]).trim() === String(data.batch).trim()) {
            rowFound = i + 1;
            break;
          }
        }
      }
      if (rowFound !== -1) {
        sheet.getRange(rowFound, 2).setValue(data.weight);
        sheet.getRange(rowFound, 3).setValue(data.price);
      } else {
        sheet.appendRow([data.batch, data.weight, data.price, '', '']);
      }
      return response({ status: 'ok' });
    }
    
    if (data.action === 'add_cdek') {
      const sheet = ss.getSheetByName('Накладные');
      if (!sheet) return response({ status: 'error', error: 'Лист "Накладные" не найден' });

      const lastRow = sheet.getLastRow();
      let rowFound = -1;
      if (lastRow > 1) {
        const values = sheet.getRange(1, 1, lastRow, 1).getValues();
        for (let i = 1; i < values.length; i++) {
          if (String(values[i][0]).trim() === String(data.batch).trim()) {
            rowFound = i + 1;
            break;
          }
        }
      }
      if (rowFound !== -1) {
        sheet.getRange(rowFound, 4).setValue(data.weight);
        sheet.getRange(rowFound, 5).setValue(data.price);
      } else {
        sheet.appendRow([data.batch, '', '', data.weight, data.price]);
      }
      return response({ status: 'ok' });
    }

    if (data.action === 'search_products') {
      const sheet = ss.getSheetByName('Товары');
      if (!sheet) return response({ status: 'error', error: 'Лист "Товары" не найден' });

      const values = sheet.getDataRange().getValues();
      const results = [];
      for (let i = 2; i < values.length; i++) {
        const status = String(values[i][11]);
        const dest = String(values[i][3]).toLowerCase();
        if (status !== 'Продано' && !dest.includes('/себе') && !dest.endsWith('себе')) {
          results.push({ id: values[i][0], name: values[i][1], batch: values[i][2] });
        }
      }
      return response({ status: 'ok', items: results.slice(-15) });
    }

    if (data.action === 'sell_product') {
      const sheet = ss.getSheetByName('Товары');
      if (!sheet) return response({ status: 'error', error: 'Лист "Товары" не найден' });

      const values = sheet.getDataRange().getValues();
      for (let i = 2; i < values.length; i++) {
        if (String(values[i][0]) === String(data.id)) {
          sheet.getRange(i + 1, 11).setValue(data.sellPrice);
          sheet.getRange(i + 1, 12).setValue('Продано');
          return response({ status: 'ok', name: values[i][1] });
        }
      }
      return response({ status: 'error', error: 'Товар не найден' });
    }

    return response({ status: 'error', error: 'Неизвестное действие' });
  } catch (err) {
    return response({ status: 'error', error: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

function response(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
