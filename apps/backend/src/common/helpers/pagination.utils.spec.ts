import { calculateSkipAndTake, getPaginationDetails } from './pagination.utils';

// NOTE: DEFAULT_PAGE / DEFAULT_PAGE_SIZE are read from process.env at module-load
// time (via ConfigService), falling back to 1 / 10 respectively. Since no
// DEFAULT_PAGE / DEFAULT_PAGE_SIZE env vars are set for the test process, the
// effective defaults below are 1 and 10.

describe('calculateSkipAndTake', () => {
  it('uses default page (1) and default page size (10) when no params are given', () => {
    expect(calculateSkipAndTake({})).toEqual({ skip: 0, take: 10 });
  });

  it('computes skip/take for a given page number and page size', () => {
    expect(calculateSkipAndTake({ pageNo: 3, pageSize: 20 })).toEqual({ skip: 40, take: 20 });
  });

  it('uses the default page size when only pageNo is given', () => {
    expect(calculateSkipAndTake({ pageNo: 2 })).toEqual({ skip: 10, take: 10 });
  });

  it('uses the default page number when only pageSize is given', () => {
    expect(calculateSkipAndTake({ pageSize: 5 })).toEqual({ skip: 0, take: 5 });
  });

  it('computes skip as 0 for the first page regardless of page size', () => {
    expect(calculateSkipAndTake({ pageNo: 1, pageSize: 50 })).toEqual({ skip: 0, take: 50 });
  });

  it('handles a page size of 0 (boundary value)', () => {
    expect(calculateSkipAndTake({ pageNo: 2, pageSize: 0 })).toEqual({ skip: 0, take: 0 });
  });
});

describe('getPaginationDetails', () => {
  it('uses default page and page size when no params are given', () => {
    expect(getPaginationDetails(25, {})).toEqual({
      pageNo: 1,
      pageSize: 10,
      totalCount: 25,
      totalPages: 3,
    });
  });

  it('computes totalPages via ceiling division', () => {
    expect(getPaginationDetails(21, { pageNo: 1, pageSize: 10 })).toEqual({
      pageNo: 1,
      pageSize: 10,
      totalCount: 21,
      totalPages: 3,
    });
  });

  it('returns totalPages of 0 when totalCount is 0', () => {
    expect(getPaginationDetails(0, { pageNo: 1, pageSize: 10 })).toEqual({
      pageNo: 1,
      pageSize: 10,
      totalCount: 0,
      totalPages: 0,
    });
  });

  it('computes an exact number of pages with no remainder', () => {
    expect(getPaginationDetails(20, { pageNo: 1, pageSize: 10 })).toEqual({
      pageNo: 1,
      pageSize: 10,
      totalCount: 20,
      totalPages: 2,
    });
  });

  it('passes through the requested pageNo and pageSize verbatim', () => {
    const result = getPaginationDetails(100, { pageNo: 4, pageSize: 15 });
    expect(result.pageNo).toBe(4);
    expect(result.pageSize).toBe(15);
    expect(result.totalPages).toBe(7);
  });
});
