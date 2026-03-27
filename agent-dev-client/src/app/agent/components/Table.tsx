import React, { type FC, useState } from 'react';

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '../shadcdn/table';

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '../shadcdn/pagination';

import { Card } from '../shadcdn/card';

import type { AsArgumentsProps, ComponentConfigT } from '@/app/lib/types';
import { registerComponent } from '@/app/lib/components/registry';

const config: ComponentConfigT = {
  type: 'component',
  isStreaming: true,
  componentName: 'Table',
  name: 'Table',
  isStrictSchema: true,
  description: 'A component that allows you to display a table with data.',
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
      },
      description: {
        type: 'string',
      },
      caption: {
        type: 'string',
        description: 'Caption text displayed at the top of the table',
      },
      columns: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            header: {
              type: 'string',
              description: 'Text displayed in the table header',
            },
            accessor: {
              type: 'string',
              description: 'The key used to access the corresponding data from the row objects',
            },
          },
          required: ['header', 'accessor'],
        },
        description: 'Array of column definitions',
      },
      rows: {
        type: 'array',
        items: {
          type: 'array',
          items: {
            type: 'string',
          },
          description:
            "Array representing a single row of data. Each value corresponds to a column, in the same order as defined in 'columns'.",
        },
        description:
          'Table data; this is a required field. It consists of arrays where each array represents a row.',
      },
      footer: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            content: {
              type: 'string',
              description: 'Content to display in the footer cell',
            },
            colSpan: {
              type: 'integer',
              description: 'Number of columns to span for this footer cell',
            },
          },
          required: ['content', 'colSpan'],
        },
        description: 'Array of footer cell definitions',
      },
    },
    additionalProperties: false,
    required: ['columns', 'rows', 'caption', 'footer', 'title', 'description'],
  },
};

type TableProps = {
  caption?: string;
  columns: {
    header: string;
    accessor: string;
  }[];
  rows: string[][];
  footer?: {
    content: string;
    colSpan?: number;
  }[];
};

const ITEMS_PER_PAGE = 20;

type Props = AsArgumentsProps<TableProps>;

const TableComponent: FC<Props> = ({ argumentsProps }) => {
  const { caption, columns = [], rows = [], footer = [] } = argumentsProps;

  const [currentPage, setCurrentPage] = useState<number>(1);

  const totalPages = Math.ceil(rows.length / ITEMS_PER_PAGE);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const paginatedData = rows.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  return (
    <Card className="flex flex-col w-full overflow-auto scrollbar scrollbar-thin font-plus-jakarta-sans">
      <Table className="mt-1">
        {caption && <TableCaption>{caption}</TableCaption>}
        <TableHeader className={'border-(--table-border-color)'}>
          <TableRow className="rounded-tl-lg rounded-tr-lg border-(--table-border-color)">
            {columns.map((column, index) => (
              <TableHead className="py-2 px-4 text-primary font-semibold text-[16px]" key={index}>
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedData.map((row, rowIndex) => (
            <TableRow key={rowIndex} className={'border-(--table-border-color)'}>
              {columns.map((column, colIndex) => {
                const cellData = row[colIndex];
                const isUrl = typeof cellData === 'string' && cellData.startsWith('http');

                return (
                  <TableCell className="py-6 px-4" key={colIndex}>
                    {isUrl ? (
                      <a href={cellData} target="_blank" rel="noopener noreferrer">
                        Link
                      </a>
                    ) : (
                      cellData
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
        {footer && (
          <TableFooter className="border-(--table-border-color)">
            <TableRow className="border-(--table-border-color)">
              {footer.map((footerCell, index) => (
                <TableCell className="py-6 px-4" key={index} colSpan={footerCell.colSpan || 1}>
                  {footerCell.content}
                </TableCell>
              ))}
            </TableRow>
          </TableFooter>
        )}
      </Table>
      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                onClick={() => handlePageChange(Math.max(currentPage - 1, 1))}
              />
            </PaginationItem>
            {Array.from({ length: totalPages }).map((_, index) => (
              <PaginationItem key={index}>
                <PaginationLink
                  href="#"
                  isActive={currentPage === index + 1}
                  onClick={() => handlePageChange(index + 1)}
                >
                  {index + 1}
                </PaginationLink>
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationNext
                href="#"
                onClick={() => handlePageChange(Math.min(currentPage + 1, totalPages))}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </Card>
  );
};

export default registerComponent(config)(function Table(props: Props) {
  return <TableComponent {...props} />;
});
