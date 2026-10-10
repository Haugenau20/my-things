import { useEffect, useRef, useState } from 'react';
import { useNarrow } from './use-narrow';
import { BottomSheet } from './BottomSheet';
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
  const narrow = useNarrow();
  const [picker, setPicker] = useState<'Room' | 'Box' | 'Decision' | 'More'>();
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
            onClick={() => {
              change({ [key]: option.value });
              setPicker(undefined);
            }}
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
        {!narrow && (
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
        )}
      </div>
      {narrow ? (
        <div className="phone-filter-chips">
          {(['Room', 'Box'] as const)
            .filter((name) => name !== 'Box' || !filters.trash)
            .map((name) => {
              const key = name === 'Room' ? 'room' : 'box';
              const value = facets[key === 'room' ? 'rooms' : 'boxes'].find(
                (option) => option.value === filters[key],
              );
              return (
                <div className="phone-facet-chip" key={key}>
                  <button
                    type="button"
                    className="facet-chip"
                    aria-label={`Choose ${name} filter`}
                    aria-pressed={!!filters[key]}
                    onClick={() => setPicker(name)}
                  >
                    {name}
                    {filters[key] ? ': ' + value?.label : ''} ▾
                  </button>
                  {!!filters[key] && (
                    <button
                      type="button"
                      className="clear-chip"
                      aria-label={`Clear ${name} filter`}
                      onClick={() => change({ [key]: '' })}
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          <button
            type="button"
            className="facet-chip"
            aria-pressed={!!filters.decision}
            onClick={() => setPicker('Decision')}
          >
            Decision{filters.decision ? ': ' + filters.decision.replaceAll('_', ' ') : ''} ▾
          </button>
          {!!filters.decision && (
            <button
              type="button"
              className="clear-chip"
              aria-label="Clear Decision filter"
              onClick={() => change({ decision: '' })}
            >
              ×
            </button>
          )}
          <button
            type="button"
            className="facet-chip"
            aria-pressed={!!filters.progress || !!filters.reviewStatus || filters.missingPhotos}
            onClick={() => setPicker('More')}
          >
            More ▾
          </button>
          {(filters.progress || filters.reviewStatus || filters.missingPhotos) && (
            <button
              type="button"
              className="clear-chip"
              aria-label="Clear More filters"
              onClick={() => change({ progress: '', reviewStatus: '', missingPhotos: false })}
            >
              ×
            </button>
          )}
          {picker && (
            <BottomSheet label={picker + ' picker'} close={() => setPicker(undefined)}>
              {picker === 'Room' || picker === 'Box' ? (
                row(
                  picker,
                  picker === 'Room' ? facets.rooms : facets.boxes,
                  picker === 'Room' ? 'room' : 'box',
                )
              ) : picker === 'Decision' ? (
                <label>
                  Decision filter
                  <select
                    aria-label="Decision filter"
                    value={filters.decision}
                    onChange={(event) => {
                      change({ decision: event.target.value });
                      setPicker(undefined);
                    }}
                  >
                    <option value="">Any decision</option>
                    {DECISIONS.map((value) => (
                      <option value={value} key={value}>
                        {value.replaceAll('_', ' ')}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div>
                  <label>
                    Progress filter
                    <select
                      aria-label="Progress filter"
                      value={filters.progress}
                      onChange={(event) => change({ progress: event.target.value })}
                    >
                      <option value="">Any progress</option>
                      {PROGRESS.map((value) => (
                        <option value={value} key={value}>
                          {value.replaceAll('_', ' ')}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Review filter
                    <select
                      aria-label="Review filter"
                      value={filters.reviewStatus}
                      onChange={(event) => change({ reviewStatus: event.target.value })}
                    >
                      <option value="">Any review state</option>
                      <option value="needs_review">needs review</option>
                      <option value="reviewed">reviewed</option>
                    </select>
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={filters.missingPhotos}
                      onChange={(event) => change({ missingPhotos: event.target.checked })}
                    />
                    Missing photos
                  </label>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => change({ progress: '', reviewStatus: '', missingPhotos: false })}
                  >
                    Clear More filters
                  </button>
                </div>
              )}
            </BottomSheet>
          )}
        </div>
      ) : (
        <div className="facet-block">
          {row('Room', facets.rooms, 'room')}
          {!filters.trash && row('Box', facets.boxes, 'box')}
        </div>
      )}
      <button type="button" className="text-button clear-all" onClick={clear}>
        Clear all
      </button>
    </fieldset>
  );
}
