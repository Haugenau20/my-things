import { useEffect, useRef } from 'react';
import type { Item, Room } from '../domain/item';
import { facetOptions } from '../domain/browse';
import type { FacetOption } from '../domain/browse';
import { DECISIONS, PROGRESS } from '../domain/organize';
import type { Box, Filters } from '../domain/organize';

export function BrowseFilters({
  items,
  rooms,
  boxes,
  filters,
  ready,
  change,
  clear,
}: {
  items: Item[];
  rooms: Room[];
  boxes: Box[];
  filters: Filters;
  ready: boolean;
  change: (patch: Partial<Filters>) => void;
  clear: () => void;
}) {
  const search = useRef<HTMLInputElement>(null);
  const facets = facetOptions(items, rooms, boxes, filters);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        !ready ||
        event.key !== '/' ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        search.current?.offsetParent === null ||
        (event.target instanceof Element &&
          event.target.closest('input,textarea,select,[contenteditable="true"]'))
      )
        return;
      event.preventDefault();
      search.current?.focus();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [ready]);
  const row = (name: 'Room' | 'Box', options: FacetOption[], key: 'room' | 'box') => (
    <div className={'facet-row facet-' + key} role="group" aria-label={name + ' filter'}>
      <span className="facet-label" aria-hidden="true">
        {name}
      </span>
      <div className="facet-chips">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={'facet-chip' + (option.count === 0 ? ' is-empty' : '')}
            aria-pressed={filters[key] === option.value}
            onClick={() => change({ [key]: option.value })}
          >
            {option.label}
            <span>{option.count}</span>
          </button>
        ))}
        {filters[key] && (
          <button
            type="button"
            className="clear-chip"
            aria-label={'Clear ' + name + ' filter'}
            onClick={() => change({ [key]: '' })}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
  const secondary = (
    name: string,
    key: 'decision' | 'progress' | 'reviewStatus',
    options: readonly string[],
  ) => (
    <div className="secondary-filter">
      <details className="filter-popover">
        <summary>
          {name}
          {filters[key] ? ': ' + filters[key].replaceAll('_', ' ') : ''} ▾
        </summary>
        <div className="filter-popup">
          <label>
            {name} filter
            <select
              aria-label={name + ' filter'}
              value={filters[key]}
              onChange={(event) => {
                change({ [key]: event.target.value });
                event.currentTarget.closest('details')?.removeAttribute('open');
              }}
            >
              <option value="">Any {name.toLowerCase()}</option>
              {options.map((value) => (
                <option key={value} value={value}>
                  {value.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
        </div>
      </details>
      {filters[key] && (
        <button
          className="clear-chip"
          type="button"
          aria-label={'Clear ' + name + ' filter'}
          onClick={() => change({ [key]: '' })}
        >
          ×
        </button>
      )}
    </div>
  );
  return (
    <fieldset
      className="browse-filters chip-filters"
      disabled={!ready}
      aria-label="Browse and filter"
    >
      <div className="search-row">
        <label className="search-label">
          Search all items
          <input
            ref={search}
            type="search"
            placeholder="Search name, serial, notes or category"
            value={filters.search}
            onChange={(event) => change({ search: event.target.value })}
          />
        </label>
        <div className="secondary-filters">
          {secondary('Decision', 'decision', DECISIONS)}
          {secondary('Progress', 'progress', PROGRESS)}
          {secondary('Review', 'reviewStatus', ['needs_review', 'reviewed'])}
          <details className="filter-popover">
            <summary>More ▾{filters.missingPhotos ? ' · Missing photos' : ''}</summary>
            <div className="filter-popup">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={filters.missingPhotos}
                  onChange={(event) => change({ missingPhotos: event.target.checked })}
                />
                Missing photos
              </label>
            </div>
          </details>
          {filters.missingPhotos && (
            <button
              type="button"
              className="clear-chip"
              aria-label="Clear Missing photos filter"
              onClick={() => change({ missingPhotos: false })}
            >
              ×
            </button>
          )}
        </div>
      </div>
      <div className="facet-block">
        {row('Room', facets.rooms, 'room')}
        {!filters.trash && row('Box', facets.boxes, 'box')}
      </div>
      <button type="button" className="text-button clear-all" onClick={clear}>
        Clear all
      </button>
    </fieldset>
  );
}
