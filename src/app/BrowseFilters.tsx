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
  const [popover, setPopover] = useState<'decision' | 'progress' | 'reviewStatus' | 'more'>();
  const popovers = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!popover) return;
    popovers.current
      ?.querySelector<HTMLElement>('.filter-popup [aria-pressed="true"], .filter-popup input')
      ?.focus();
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !popovers.current?.contains(event.target))
        setPopover(undefined);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      popovers.current?.querySelector<HTMLElement>('[aria-expanded="true"]')?.focus();
      setPopover(undefined);
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('keydown', key);
    };
  }, [popover]);
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
  type ChoiceKey = 'decision' | 'progress' | 'reviewStatus';
  const CHOICES = {
    decision: { name: 'Decision', options: DECISIONS },
    progress: { name: 'Progress', options: PROGRESS },
    reviewStatus: { name: 'Review', options: ['needs_review', 'reviewed'] as const },
  };
  // Options are listed directly in the popover/sheet so one click opens and one click chooses.
  const choices = (key: ChoiceKey, done: () => void) => (
    <div className="filter-choices" role="group" aria-label={CHOICES[key].name + ' filter'}>
      {['', ...CHOICES[key].options].map((value) => (
        <button
          key={value || 'any'}
          type="button"
          className="filter-choice"
          aria-pressed={filters[key] === value}
          onClick={() => {
            change({ [key]: value });
            done();
          }}
        >
          {value ? value.replaceAll('_', ' ') : 'Any ' + CHOICES[key].name.toLowerCase()}
        </button>
      ))}
    </div>
  );
  const popoverTrigger = (id: ChoiceKey | 'more', label: string) => (
    <button
      type="button"
      className="filter-trigger"
      aria-expanded={popover === id}
      aria-controls={'filter-popup-' + id}
      onClick={() => setPopover(popover === id ? undefined : id)}
    >
      {label} ▾
    </button>
  );
  const secondary = (key: ChoiceKey) => (
    <div className="secondary-filter">
      <div className="filter-popover">
        {popoverTrigger(
          key,
          CHOICES[key].name + (filters[key] ? ': ' + filters[key].replaceAll('_', ' ') : ''),
        )}
        {popover === key && (
          <div className="filter-popup" id={'filter-popup-' + key}>
            {choices(key, () => setPopover(undefined))}
          </div>
        )}
      </div>
      {filters[key] && (
        <button
          className="clear-chip"
          type="button"
          aria-label={'Clear ' + CHOICES[key].name + ' filter'}
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
          <div className="secondary-filters" ref={popovers}>
            {secondary('decision')}
            {secondary('progress')}
            {secondary('reviewStatus')}
            <div className="filter-popover">
              {popoverTrigger('more', 'More' + (filters.missingPhotos ? ' · Missing photos' : ''))}
              {popover === 'more' && (
                <div className="filter-popup" id="filter-popup-more">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={filters.missingPhotos}
                      onChange={(event) => change({ missingPhotos: event.target.checked })}
                    />
                    Missing photos
                  </label>
                </div>
              )}
            </div>
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
                choices('decision', () => setPicker(undefined))
              ) : (
                <div className="filter-sheet-groups">
                  <h3>Progress</h3>
                  {choices('progress', () => undefined)}
                  <h3>Review</h3>
                  {choices('reviewStatus', () => undefined)}
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
