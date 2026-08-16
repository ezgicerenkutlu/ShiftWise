/**
 * Schedule export utilities.
 *
 * Supports four formats with professional formatting:
 *  - CSV   (raw data, UTF-8 BOM for Excel compatibility)
 *  - Excel (multi-sheet workbook with styled headers and borders)
 *  - PDF   (letter-size, auto-table with branded header/footer)
 *  - PNG   (renders a visual weekly grid to a canvas and downloads)
 *
 * All functions are client-side and take already-loaded data (shifts +
 * employees) so no additional Supabase calls are needed.
 */

import { format, differenceInMinutes, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay } from 'date-fns';
import type { Employee, Shift, ShiftStatus } from '@/lib/types';

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

export type ExportFormat = 'csv' | 'excel' | 'pdf' | 'png';

const STATUS_LABELS: Record<ShiftStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  confirmed: 'Confirmed',
  completed: 'Completed',
};

const DAY_HEADERS = ['Date', 'Day', 'Start', 'End', 'Hours', 'Employee', 'Role', 'Title', 'Status'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shiftHours(s: Shift): number {
  return Math.round((differenceInMinutes(new Date(s.end_time), new Date(s.start_time)) / 60) * 100) / 100;
}

function employeeName(employees: Employee[], shift: Shift): string {
  const emp = employees.find((e) => e.id === shift.employee_id);
  return emp?.full_name ?? 'Unassigned';
}

function employeeRole(employees: Employee[], shift: Shift): string {
  const emp = employees.find((e) => e.id === shift.employee_id);
  return emp?.job_title ?? '';
}

function buildRowData(shifts: Shift[], employees: Employee[]): (string | number)[][] {
  return shifts
    .slice()
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    .map((s) => [
      format(new Date(s.start_time), 'MMM d, yyyy'),
      format(new Date(s.start_time), 'EEEE'),
      format(new Date(s.start_time), 'HH:mm'),
      format(new Date(s.end_time), 'HH:mm'),
      shiftHours(s),
      employeeName(employees, s),
      employeeRole(employees, s),
      s.title,
      STATUS_LABELS[s.status],
    ]);
}

function getWeekRange(date: Date): { start: Date; end: Date } {
  return {
    start: startOfWeek(date, { weekStartsOn: 1 }),
    end: endOfWeek(date, { weekStartsOn: 1 }),
  };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function fileSafeDate(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

// ---------------------------------------------------------------------------
// CSV Export
// ---------------------------------------------------------------------------

export function exportCSV(shifts: Shift[], employees: Employee[], restaurantName: string, weekDate: Date) {
  const { start, end } = getWeekRange(weekDate);
  const rows = buildRowData(shifts, employees);

  const headerTitle = `${restaurantName} — Weekly Schedule (${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')})`;
  const lines: string[] = [headerTitle, '', DAY_HEADERS.join(','), ...rows.map((r) => r.map(escapeCSV).join(','))];

  // BOM for Excel UTF-8 compatibility
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `schedule-${fileSafeDate(start)}.csv`);
}

function escapeCSV(value: string | number): string {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ---------------------------------------------------------------------------
// Excel Export
// ---------------------------------------------------------------------------

export async function exportExcel(shifts: Shift[], employees: Employee[], restaurantName: string, weekDate: Date) {
  const XLSX = await import('xlsx');
  const { start, end } = getWeekRange(weekDate);
  const rows = buildRowData(shifts, employees);

  // Summary sheet
  const totalHours = rows.reduce((sum, r) => sum + (r[4] as number), 0);
  const summaryData = [
    [restaurantName],
    [`Weekly Schedule: ${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`],
    [],
    ['Total Shifts', rows.length],
    ['Total Hours', totalHours],
    ['Generated', format(new Date(), 'MMM d, yyyy HH:mm')],
  ];

  // Schedule sheet
  const scheduleData = [DAY_HEADERS, ...rows];

  // Employee summary sheet
  const empHours: Record<string, number> = {};
  for (const r of rows) {
    const name = r[5] as string;
    empHours[name] = (empHours[name] ?? 0) + (r[4] as number);
  }
  const empData: (string | number)[][] = [['Employee', 'Total Hours']];
  for (const [name, hrs] of Object.entries(empHours).sort((a, b) => b[1] - a[1])) {
    empData.push([name, hrs]);
  }

  const wb = XLSX.utils.book_new();

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary['!cols'] = [{ wch: 20 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  const wsSchedule = XLSX.utils.aoa_to_sheet(scheduleData);
  wsSchedule['!cols'] = DAY_HEADERS.map((h) => ({ wch: h === 'Title' ? 25 : h === 'Employee' ? 20 : 12 }));
  XLSX.utils.book_append_sheet(wb, wsSchedule, 'Schedule');

  const wsEmp = XLSX.utils.aoa_to_sheet(empData);
  wsEmp['!cols'] = [{ wch: 25 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, wsEmp, 'By Employee');

  XLSX.writeFile(wb, `schedule-${fileSafeDate(start)}.xlsx`);
}

// ---------------------------------------------------------------------------
// PDF Export
// ---------------------------------------------------------------------------

export async function exportPDF(shifts: Shift[], employees: Employee[], restaurantName: string, weekDate: Date) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const { start, end } = getWeekRange(weekDate);
  const rows = buildRowData(shifts, employees);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(restaurantName, 40, 45);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text(`Weekly Schedule — ${format(start, 'MMM d')} to ${format(end, 'MMM d, yyyy')}`, 40, 65);

  // Summary line
  const totalHours = rows.reduce((sum, r) => sum + (r[4] as number), 0);
  doc.setFontSize(10);
  doc.text(`${rows.length} shifts  |  ${totalHours.toFixed(1)} total hours  |  Generated ${format(new Date(), 'MMM d, yyyy')}`, 40, 82);
  doc.setTextColor(0);

  // Table
  autoTable(doc, {
    head: [DAY_HEADERS],
    body: rows.map((r) => r.map((c) => String(c))),
    startY: 95,
    styles: { fontSize: 9, cellPadding: 5, lineColor: [220, 220, 220], lineWidth: 0.5 },
    headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 70 },
      2: { cellWidth: 50 },
      3: { cellWidth: 50 },
      4: { cellWidth: 50 },
      5: { cellWidth: 100 },
      6: { cellWidth: 70 },
      7: { cellWidth: 120 },
      8: { cellWidth: 70 },
    },
    margin: { left: 40, right: 40 },
  });

  // Footer with page numbers
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `${restaurantName} — Confidential Schedule`,
      40,
      doc.internal.pageSize.getHeight() - 20
    );
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth - 80,
      doc.internal.pageSize.getHeight() - 20
    );
  }

  doc.save(`schedule-${fileSafeDate(start)}.pdf`);
}

// ---------------------------------------------------------------------------
// PNG Export (visual weekly grid)
// ---------------------------------------------------------------------------

export async function exportPNG(shifts: Shift[], employees: Employee[], restaurantName: string, weekDate: Date) {
  const { start, end } = getWeekRange(weekDate);
  const days = eachDayOfInterval({ start, end });

  // Filter to this week's shifts
  const weekShifts = shifts.filter((s) => {
    const d = new Date(s.start_time);
    return d >= start && d <= end;
  });

  // Canvas dimensions
  const dayWidth = 200;
  const hourHeight = 40;
  const startHour = 6;
  const endHour = 24;
  const totalHours = endHour - startHour;
  const headerHeight = 80;
  const leftMargin = 60;
  const width = leftMargin + days.length * dayWidth + 20;
  const height = headerHeight + totalHours * hourHeight + 40;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Title
  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(restaurantName, 20, 30);

  ctx.fillStyle = '#64748b';
  ctx.font = '13px sans-serif';
  ctx.fillText(
    `Weekly Schedule — ${format(start, 'MMM d')} to ${format(end, 'MMM d, yyyy')}`,
    20,
    52
  );

  // Day headers
  ctx.font = 'bold 12px sans-serif';
  days.forEach((day, i) => {
    const x = leftMargin + i * dayWidth;

    // Header background
    ctx.fillStyle = i === 0 || i === 6 ? '#f1f5f9' : '#f8fafc';
    ctx.fillRect(x, headerHeight - 25, dayWidth, 25);

    // Header text
    ctx.fillStyle = '#1e293b';
    ctx.textAlign = 'center';
    ctx.fillText(format(day, 'EEE MMM d'), x + dayWidth / 2, headerHeight - 8);
    ctx.textAlign = 'left';
  });

  // Hour grid lines
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 0.5;
  ctx.font = '10px sans-serif';
  ctx.fillStyle = '#94a3b8';
  for (let h = 0; h <= totalHours; h++) {
    const y = headerHeight + h * hourHeight;
    ctx.beginPath();
    ctx.moveTo(leftMargin, y);
    ctx.lineTo(width - 20, y);
    ctx.stroke();

    // Hour label
    const hourLabel = format(new Date().setHours(startHour + h, 0, 0, 0), 'HH:mm');
    ctx.fillText(hourLabel, 10, y + 4);
  }

  // Day vertical lines
  days.forEach((_, i) => {
    const x = leftMargin + i * dayWidth;
    ctx.beginPath();
    ctx.moveTo(x, headerHeight - 25);
    ctx.lineTo(x, height - 20);
    ctx.stroke();
  });

  // Shift blocks
  const shiftColors = [
    '#3b82f6', '#22c55e', '#f59e0b', '#a78bfa',
    '#ef4444', '#06b6d4', '#ec4899', '#84cc16',
  ];

  weekShifts.forEach((shift) => {
    const shiftStart = new Date(shift.start_time);
    const shiftEnd = new Date(shift.end_time);
    const dayIndex = days.findIndex((d) => isSameDay(d, shiftStart));
    if (dayIndex === -1) return;

    const startH = shiftStart.getHours() + shiftStart.getMinutes() / 60;
    const endH = shiftEnd.getHours() + shiftEnd.getMinutes() / 60;
    const clampedStart = Math.max(startH, startHour);
    const clampedEnd = Math.min(endH, endHour);
    if (clampedEnd <= clampedStart) return;

    const x = leftMargin + dayIndex * dayWidth + 3;
    const y = headerHeight + (clampedStart - startHour) * hourHeight;
    const blockWidth = dayWidth - 6;
    const blockHeight = (clampedEnd - clampedStart) * hourHeight;

    const emp = employees.find((e) => e.id === shift.employee_id);
    const color = emp?.color ?? shiftColors[dayIndex % shiftColors.length];

    // Block background
    ctx.fillStyle = color + '30';
    ctx.fillRect(x, y, blockWidth, blockHeight);

    // Block border
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, blockWidth, blockHeight);

    // Text
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 10px sans-serif';
    const empName = emp?.full_name ?? 'Unassigned';
    ctx.fillText(empName, x + 5, y + 14);

    ctx.font = '9px sans-serif';
    ctx.fillStyle = '#475569';
    ctx.fillText(`${format(shiftStart, 'HH:mm')}–${format(shiftEnd, 'HH:mm')}`, x + 5, y + 27);

    if (blockHeight > 35) {
      ctx.fillText(shift.title, x + 5, y + 40);
    }
  });

  // Footer
  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px sans-serif';
  ctx.fillText(`Generated ${format(new Date(), 'MMM d, yyyy HH:mm')}`, 20, height - 5);

  // Download
  canvas.toBlob((blob) => {
    if (blob) downloadBlob(blob, `schedule-${fileSafeDate(start)}.png`);
  }, 'image/png');
}
