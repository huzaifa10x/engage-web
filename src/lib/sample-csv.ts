/** A ready-to-fill contacts CSV in exactly the format the importer expects. */
export function downloadSampleCsv(extraColumns: string[] = []): void {
    const header = ['phone', 'name', 'email', 'tags', ...extraColumns];
    const pad = extraColumns.map(() => '');
    const rows = [
        ['+971501234567', 'Sara Ahmed', 'sara@example.com', 'VIP;Dubai', ...pad],
        ['+971551234567', 'Omar Khan', '', 'Newsletter', ...pad],
        ['+923001234567', 'Ayesha Malik', 'ayesha@example.com', '', ...pad],
    ];
    const csv = [header, ...rows].map((row) => row.map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(',')).join('\r\n');

    // The BOM makes Excel open the file as UTF-8 (Arabic names stay readable).
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = '10x-engage-contacts-sample.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}
