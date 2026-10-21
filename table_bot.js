function getSS() {
  return SpreadsheetApp.getActiveSpreadsheet();
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
    
    // 1. ДОБАВЛЕНИЕ ТОВАРА
    if (data.action === 'add_product') {
      const sheetProd = ss.getSheetByName('Товары');
      const sheetDeliv = ss.getSheetByName('Доставка');
      
      if (!sheetProd || !sheetDeliv) {
        return response({ status: 'error', error: 'Не найден лист "Товары" или "Доставка"' });
      }
      
      const lastRow = Math.max(sheetProd.getLastRow() + 1, 3);
      const nextId = lastRow - 2;

      sheetProd.appendRow([
        nextId,
        data.name,
        data.batch,
        data.sourceDest,
        data.cnyPrice,
        data.rate,
        '', 
        data.weight,
        '', 
        '', 
        '', 
        'В пути',
        ''  
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
    
    // 2. ВНЕСЕНИЕ КАРГО
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
    
    // 3. ВНЕСЕНИЕ СДЭК
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

    // 4. СПИСОК ТОВАРОВ ДЛЯ ПРОДАЖИ
    if (data.action === 'search_products') {
      const sheet = ss.getSheetByName('Товары');
      if (!sheet) return response({ status: 'error', error: 'Не найден лист "Товары"' });

      const lastRow = sheet.getLastRow();
      if (lastRow < 3) {
        return response({ status: 'ok', items: [] });
      }

      // Считываем диапазон строк с товарами (начиная со строки 3)
      const values = sheet.getRange(3, 1, lastRow - 2, 12).getValues();
      const results = [];
      
      for (let i = 0; i < values.length; i++) {
        const id = values[i][0];
        const name = values[i][1];
        const batch = values[i][2];
        const status = String(values[i][11] || '').trim();
        
        // Показываем все позиции, у которых есть название и статус не "Продано"
        if (name && String(name).trim() !== '' && status !== 'Продано') {
          results.push({
            id: id || (i + 1),
            name: String(name),
            batch: batch ? String(batch) : ''
          });
        }
      }
      return response({ status: 'ok', items: results.slice(-25) });
    }

    // 5. ФИКСАЦИЯ ПРОДАЖИ
    if (data.action === 'sell_product') {
      const sheet = ss.getSheetByName('Товары');
      if (!sheet) return response({ status: 'error', error: 'Не найден лист "Товары"' });

      const lastRow = sheet.getLastRow();
      if (lastRow < 3) return response({ status: 'error', error: 'Таблица пуста' });

      const values = sheet.getRange(3, 1, lastRow - 2, 1).getValues();
      for (let i = 0; i < values.length; i++) {
        if (String(values[i][0]).trim() === String(data.id).trim()) {
          const rowNum = i + 3;
          sheet.getRange(rowNum, 11).setValue(data.sellPrice); // Колонка K (Цена продажи)
          sheet.getRange(rowNum, 12).setValue('Продано');      // Колонка L (Статус)
          return response({ status: 'ok', name: sheet.getRange(rowNum, 2).getValue() });
        }
      }
      return response({ status: 'error', error: 'Товар с таким ID не найден' });
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

