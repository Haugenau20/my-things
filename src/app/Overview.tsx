import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { Item, Room } from '../domain/item';
import type { Box } from '../domain/organize';
import { overviewMatrix, sellingSummary } from '../domain/overview';
import type { SellingGroup } from '../domain/overview';
import { moneyInput } from '../domain/organize';
import { useNarrow } from './use-narrow';

export function Overview({
  items,
  rooms,
  boxes,
  browse,
}: {
  items: Item[];
  rooms: Room[];
  boxes: Box[];
  browse: (room: string, box: string, decision?: string) => void;
}) {
  const matrix = overviewMatrix(items, rooms, boxes);
  const selling = sellingSummary(items);
  const narrow = useNarrow();
  const [summary, setSummary] = useState('Choose a count to see its things.');
  const maximum = Math.max(1, ...matrix.rows.flatMap((row) => row.cells.map((cell) => cell.count)));
  function tile(room: (typeof matrix.rows)[number], box: string, count: number) {
    const label = matrix.columns.find((column) => column.value === box)!.label;
    const description = `${room.label} · ${label}: ${count} things`;
    const color = box === 'unpacked' ? '54,90,61' : box === 'gone' ? '98,107,96' : '198,167,124';
    return (
      <button
        type="button"
        className={'overview-count ' + (count ? '' : 'empty')}
        style={
          {
            '--tile-tint': `rgba(${color},${count ? 0.08 + (0.24 * count) / maximum : 0.025})`,
          } as CSSProperties
        }
        aria-label={'Browse ' + description}
        onFocus={() => setSummary(description)}
        onMouseEnter={() => setSummary(description)}
        onClick={() => browse(room.value, box)}
      >
        {count || '·'}
      </button>
    );
  }
  function sellingLine(title: string, group: SellingGroup, box: string) {
    const amounts = group.totals.map((total) => `${total.currency} ${moneyInput(total)}`);
    const details = [
      `${group.count} ${group.count === 1 ? 'thing' : 'things'}`,
      ...(group.unvalued ? [`${group.unvalued} without a value`] : []),
    ];
    return (
      <button
        type="button"
        className="overview-selling-line"
        aria-label={`Browse ${title}: ${[amounts.join(', ') || 'no values', ...details].join(' · ')}`}
        onClick={() => browse('', box, 'sell')}
      >
        <span className="eyebrow">{title}</span>
        <span className="overview-selling-amounts">
          {amounts.length ? amounts.map((amount) => <strong key={amount}>{amount}</strong>) : '—'}
        </span>
        <span className="overview-selling-details">{details.join(' · ')}</span>
      </button>
    );
  }
  return (
    <section aria-label="Inventory overview" className="overview">
      <header className="overview-heading">
        <div>
          <p className="eyebrow">Overview</p>
          <h1>Where everything is</h1>
        </div>
        <p>
          {matrix.totals.unpacked} not packed · {matrix.totals.packed} in {matrix.totals.boxes}{' '}
          boxes · {matrix.totals.gone} gone
        </p>
      </header>
      <section aria-label="Selling totals" className="overview-selling">
        {sellingLine('Still to sell', selling.open, '')}
        {sellingLine('Sold so far', selling.sold, 'gone')}
      </section>
      {narrow ? (
        <div className="overview-room-list">
          {matrix.rows.map((row) => (
            <article key={row.value} aria-label={row.label}>
              <header>
                <button className="text-button" onClick={() => browse(row.value, '')}>
                  {row.label}
                </button>
                <span>{row.total} total</span>
              </header>
              <dl>
                {row.cells.map((cell) => (
                  <div key={cell.box}>
                    <dt>
                      <button className="text-button" onClick={() => browse('', cell.box)}>
                        {matrix.columns.find((column) => column.value === cell.box)!.label}
                      </button>
                    </dt>
                    <dd>{tile(row, cell.box, cell.count)}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
      ) : (
        <div className="overview-matrix-scroll" tabIndex={0} aria-label="Room by Box matrix">
          <table>
            <caption className="sr-only">
              Ready things by Room and Box, including Gone and excluding Trash
            </caption>
            <thead>
              <tr>
                <th scope="col">Room</th>
                {matrix.columns.map((column) => (
                  <th scope="col" key={column.value}>
                    <button
                      className={
                        'text-button ' +
                        (!['unpacked', 'gone'].includes(column.value) ? 'box-heading' : '')
                      }
                      onClick={() => browse('', column.value)}
                    >
                      {column.label}
                    </button>
                  </th>
                ))}
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map((row) => (
                <tr key={row.value}>
                  <th scope="row">
                    <button className="text-button" onClick={() => browse(row.value, '')}>
                      {row.label}
                    </button>
                  </th>
                  {row.cells.map((cell) => (
                    <td key={cell.box}>{tile(row, cell.box, cell.count)}</td>
                  ))}
                  <td className="overview-total">{row.total}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                {matrix.columns.map((column) => (
                  <td key={column.value}>
                    {matrix.rows.reduce(
                      (sum, row) =>
                        sum + (row.cells.find((cell) => cell.box === column.value)?.count ?? 0),
                      0,
                    )}
                  </td>
                ))}
                <td>{matrix.totals.total}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <footer className="overview-legend">
        <p>
          <span className="unpacked-key">Not packed</span> ·{' '}
          <span className="packed-key">In a box</span> · <span className="gone-key">Gone</span>
        </p>
        <p>
          Totals include Gone. Room links show owned things. Selling totals add each entry&apos;s
          value and keep currencies separate.
        </p>
        <p aria-live="polite">{summary}</p>
      </footer>
    </section>
  );
}
