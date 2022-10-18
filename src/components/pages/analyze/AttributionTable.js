import React from 'react';
import PropTypes from 'prop-types';
import Component from 'components/Component';
import Table from 'components/controls/Table';
import {formatBudget, formatNumber, formatNumberWithDecimalPoint} from 'components/utils/budget';
import {sumBy, findIndex, get} from 'lodash';
import StageSelector from 'components/pages/analyze/StageSelector';
import style from 'styles/analyze/analyze.css';
import {getNickname} from 'components/utils/indicators';
import {precisionFormat} from 'utils';
import {averageFormatter, influencedMapping} from 'components/utils/utils';
import Tooltip from 'components/controls/Tooltip';


const getNicknameForIndicator = (indicator, isSingular) => {
  if (indicator === 'webVisits') {
    if (isSingular) {
      return 'Identified Visitor';
    }
    else {
      return 'Identified Visitors';
    }
  }

  else {
    return getNickname(indicator, isSingular);
  }
};
const getSingularNickname = (indicator) => getNicknameForIndicator(indicator, true);
const getPluralNickname = (indicator) => getNicknameForIndicator(indicator, false);

const costDependentColumnTypes = [
  'cost',
  'efficiency',
  'roi',
  'pipeline-roi'
];

const withZeroDefault = (getter) => (arg, ...other) => getter(arg, ...other) || 0;

export default class AttributionTable extends Component {

  style = style;

  static propTypes = {
    title: PropTypes.string,
    data: PropTypes.array,
    dataNickname: PropTypes.string,
    getItemCost: PropTypes.func,
    getItemTitle: PropTypes.func,
    columnsBefore: PropTypes.array,
    columnsAfter: PropTypes.array,
    webVisitsColumns: PropTypes.array,
    showTotalRow: PropTypes.bool,
    showCostColumns: PropTypes.bool,
    attributionModel: PropTypes.string,
    TableProps: PropTypes.object,
    onClick: PropTypes.func,
    defaultStageKey: PropTypes.string,
  };

  static defaultProps = {
    columnsBefore: [],
    columnsAfter: [],
    webVisitsColumns: [],
    showTotalRow: true,
    showCostColumns: true
  };

  state = {
    selectedStageKey: this.props.defaultStageKey || 'MCL',
    sortByColumn: 'row-title'
  };
  nonEmptyRowDataKeys = [
      'stage-indicator',
      'influenced-stage-indicator',
      'pipeline',
      'revenue',
      'influenced-revenue',
  ]
  getOnClickElement = item => (
    <div className={this.classes.rowClickIcon} onClick={() => this.props.onClick(item, this.state.selectedStageKey)}/>
  );

  getHeaderWithTooltip = (id, header) => {
    const {attributionModel, dataNickname} = this.props;
    const {selectedStageKey} = this.state;

    const titleColumnNameLower = dataNickname.toLowerCase();
    const volumeColumnTooltip = (volumeNickname) => `Total ${volumeNickname} generated by the ${titleColumnNameLower}. Calculated by ${attributionModel} model`;
    const toolTipTextMapping = {
      'influenced-stage-indicator': `# of ${getSingularNickname(selectedStageKey)} conversion journeys which the ${titleColumnNameLower} took part in`,
      'stage-indicator': `# of ${getPluralNickname(selectedStageKey)} generated by the ${titleColumnNameLower}. Calculated by ${attributionModel} model`,
      'influenced-revenue': `Total revenue generated from journeys which the ${titleColumnNameLower} took part in`,
      'revenue': volumeColumnTooltip('revenue'),
      'pipeline': volumeColumnTooltip('pipeline'),
      'efficiency': `Cost per ${getSingularNickname(selectedStageKey)}`
    };
    const tooltipData = toolTipTextMapping[id];

    return (
      <Tooltip
        tip={tooltipData}
        id='header-tooltip'
        TooltipProps={{
          effect: 'float'
        }}
      >
        {header}
      </Tooltip>
    );
  };

  averageFormatterROI = value => `${averageFormatter(value, false)}${isFinite(value) && value ? 'x' : ''}`;

  /**
   * Makes columns for each stage by picking them from common config
   * by ids (and extending them with additional data if required)
   *
   * @param ids Array<string | columnAdditionalData: Object>
   */
  pickColumns = (ids) => {
    const {
      showTotalRow,
      data,
      dataNickname,
      getItemCost,
      getItemTitle,
      columnsBefore
    } = this.props;
    const {selectedStageKey} = this.state;

    const getStageEfficiency = (value) => {
      const efficiency = averageFormatter(value);
      return (
        <div className={this.classes.averageCell}>
          <span>{efficiency}</span>{` per ${getSingularNickname(selectedStageKey)}`}
        </div>
      );
    };
    const influencedDataKey = influencedMapping[selectedStageKey];
    const totalCost = sumBy(data, withZeroDefault(getItemCost));
    const getTotalIndicatorGenerated = (data, indicatorKey, isRounded = true) =>
      String((isRounded ? Math.round : formatNumberWithDecimalPoint)(data.reduce((sum, item) => sum + (item[indicatorKey] || 0), 0)));
    const totalMetric = getTotalIndicatorGenerated(data, selectedStageKey, false);
    const totalRevenue = sumBy(data, withZeroDefault((item) => item.revenue));
    const totalInfluencedRevenue = sumBy(data, withZeroDefault((item) => item.influencedRevenue));
    const totalPipeline = sumBy(data, withZeroDefault((item) => item.pipeline));
    const totalLTV = sumBy(data, withZeroDefault((item) => item.LTV));

    let columns = [
      {
        id: 'row-title',
        header: dataNickname,
        accessor: (item) => item,
        cell: (item) => getItemTitle(item).node,
        footer: columnsBefore.some(column => column.footer === 'Total') ? '' : 'Total',
        sortable: true,
        sortMethod: (a, b) => {
          const aTitle = getItemTitle(a), bTitle = getItemTitle(b);
          return get(aTitle, 'text', '').localeCompare(get(bTitle, 'text', ''));
        }
      },
      {
        id: 'cost',
        header: 'Cost',
        accessor: getItemCost,
        cell: withZeroDefault(formatBudget),
        footer: data => formatBudget(sumBy(data, withZeroDefault(getItemCost))),
        sortable: true
      },
      {
        id: 'stage-indicator',
        accessor: selectedStageKey,
        cell: withZeroDefault(precisionFormat),
        footer: totalMetric,
        sortable: true
      },
      {
        id: 'influenced-stage-indicator',
        accessor: influencedDataKey,
        cell: withZeroDefault(Math.round),
        footer: getTotalIndicatorGenerated(data, influencedDataKey),
        sortable: true
      },
      {
        id: 'efficiency',
        header: this.getHeaderWithTooltip('efficiency', 'Efficiency'),
        accessor: (item) => getItemCost(item) / precisionFormat(item[selectedStageKey] || 0),
        cell: withZeroDefault(getStageEfficiency),
        footer: getStageEfficiency(totalCost / totalMetric),
        sortable: true
      },
      {
        id: 'revenue',
        header: this.getHeaderWithTooltip('revenue', 'Attributed Revenue'),
        accessor: 'revenue',
        cell: withZeroDefault(formatBudget),
        footer: formatBudget(totalRevenue),
        sortable: true
      },
      {
        id: 'arpa',
        header: 'ARPA',
        accessor: (item) => item.revenue / precisionFormat(item[selectedStageKey] || 0),
        cell: withZeroDefault(averageFormatter),
        footer: averageFormatter(totalRevenue / totalMetric),
        sortable: true
      },
      {
        id: 'roi',
        header: 'ROI',
        accessor: (item) => item.revenue / getItemCost(item),
        cell: withZeroDefault(this.averageFormatterROI),
        footer: this.averageFormatterROI(totalRevenue / totalCost),
        sortable: true
      },
      {
        id: 'pipeline',
        header: this.getHeaderWithTooltip('pipeline', 'Pipeline'),
        accessor: 'pipeline',
        cell: withZeroDefault(formatBudget),
        footer: formatBudget(totalPipeline),
        sortable: true
      },
      {
        id: 'pipeline-roi',
        header: 'Pipeline ROI',
        accessor: (item) => item.pipeline / getItemCost(item),
        cell: withZeroDefault(this.averageFormatterROI),
        footer: this.averageFormatterROI(totalPipeline / totalCost),
        sortable: true
      },
      {
        id: 'ltv',
        header: 'LTV',
        accessor: 'LTV',
        cell: withZeroDefault(formatBudget),
        footer: formatBudget(totalLTV),
        sortable: true
      },
      {
        id: 'influenced-revenue',
        header: this.getHeaderWithTooltip('influenced-revenue', 'Touched Revenue'),
        accessor: 'influencedRevenue',
        cell: withZeroDefault(formatBudget),
        footer: formatBudget(totalInfluencedRevenue),
        sortable: true
      },
      {
        id: 'on-click',
        header: '',
        accessor: this.getOnClickElement,
        cell: (title) => title,
        footer: '',
        sortable: false
      }
    ];

    if (!showTotalRow) {
      // erase footers from columns
      columns = columns.map(({footer, ...column}) => column);
    }

    return ids.map((idParam) => {
      if (Array.isArray(idParam)) {
        const id = idParam[0];
        const additionalData = idParam[1];
        const column = columns.find((column) => column.id === id);

        return {
          ...column,
          ...additionalData
        };
      }

      return columns.find((column) => column.id === idParam);
    });
  };

  getIndicatorDefinition = (indicator, specificColumns = []) => ({
    name: getPluralNickname(indicator),
    dataKey: indicator,
    columns: this.pickColumns([
      'row-title',
      'cost',
      ['influenced-stage-indicator', {
        header: this.getHeaderWithTooltip('influenced-stage-indicator', `Touched ${getPluralNickname(indicator)}`)
      }],
      ['stage-indicator', {
        header: this.getHeaderWithTooltip('stage-indicator', `Attributed ${getPluralNickname(indicator)}`)
      }],
      'efficiency'
    ]).concat(specificColumns)
  });

  getStages = () => {
    const {showCostColumns, webVisitsColumns} = this.props;

    // I don't like such solution, but it is the only possible solution I see
    const sortWebVisits = (col1, col2) => {
      const columnsOrder = ['row-title', 'cost', 'impressions', 'clicks', 'stage-indicator', 'efficiency', 'conversions'];
      const i1 = columnsOrder.findIndex(c => c === col1.id);
      const i2 = columnsOrder.findIndex(c => c === col2.id);

      return i1 - i2;
    };


    const basicStages = [
      {
        name: 'Identified Visitors',
        dataKey: 'webVisits',
        columns: this.pickColumns([
          'row-title',
          'cost',
          ['stage-indicator', {
            header: this.getHeaderWithTooltip('stage-indicator', 'Identified Visitors')
          }],
          'efficiency'
        ]).concat(webVisitsColumns).sort(sortWebVisits)
      },
      this.getIndicatorDefinition('MCL', this.pickColumns(['on-click'])),
      this.getIndicatorDefinition('MQL', this.pickColumns(['on-click'])),
      this.getIndicatorDefinition('SQL', this.pickColumns(['on-click'])),
      this.getIndicatorDefinition('opps', this.pickColumns(['pipeline', 'pipeline-roi', 'on-click'])),
      this.getIndicatorDefinition('users', this.pickColumns(['influenced-revenue', 'revenue', 'roi', 'arpa', 'ltv', 'on-click']))
    ];

    return showCostColumns
      ? basicStages
      : basicStages.map((stage) => ({
        ...stage,
        columns: stage.columns.filter(column => !costDependentColumnTypes.includes(column.id))
      }));
  };
  
  getColumnsInCurrentStage=()=>{
    const {selectedStageKey} = this.state;

    const selectedStage = this.getStages().find(
      (stage) => stage.dataKey === selectedStageKey
    );

    const {columns} = selectedStage;
    return columns;
  }

  getTableData = () => {
    const {data, webVisitsColumns} = this.props;
    const currentColumns = this.getColumnsInCurrentStage();
    const nonEmptyRowDataKeys = this.pickColumns(this.nonEmptyRowDataKeys)
    .concat(webVisitsColumns)
    .filter(({accessor})=> findIndex(currentColumns,{accessor})>=0)
    .map(({accessor}) => accessor);

    return data.filter((item) => nonEmptyRowDataKeys.some(columnType => item[columnType]));
  };

  setColumnsFooter = (data, columns) => {
    return columns.map(column => {
      if (typeof column.footer === 'function') {
        return {
          ...column,
          footer: column.footer(data)
        };
      }
      return column;
    });
  };

  render() {
    const {
      title,
      columnsBefore,
      columnsAfter,
      data,
      TableProps
    } = this.props;
    const {selectedStageKey} = this.state;

    const stagesData = this.getStages().map(stage => {
      return {
        key: stage.dataKey,
        name: stage.name,
        number: formatNumber(Math.round(sumBy(data, withZeroDefault(item => item[stage.dataKey]))))
      };
    });

    const selectedStage = this.getStages().find(
      (stage) => stage.dataKey === selectedStageKey
    );

    const {columns} = selectedStage;

    // On click column is always last one
    const onClickColumnIndex = columns.findIndex((column) => column.id === 'on-click');
    const onClickColumn = onClickColumnIndex !== -1 ? columns.splice(onClickColumnIndex, 1) : [];

    const tableData = this.getTableData();
    const tableColumns = this.setColumnsFooter(tableData, [
      ...columnsBefore,
      ...columns,
      ...columnsAfter,
      ...onClickColumn
    ]);
    return (
      <div className={this.classes.rows}>
        <div className={this.classes.item}>
          <StageSelector
            stages={stagesData}
            selectedKey={selectedStageKey}
            selectStage={(selectedStageKey) => this.setState({selectedStageKey})}
          />
          <div className={this.classes.itemTitle}>{title}</div>
          <Table
            style={{height: 440}}
            className={this.classes.channelsImpactsTable}
            rowGroupClassName={this.classes.rowGroup}
            rowClassName={this.classes.row}
            headerClassName={this.classes.header}
            headRowClassName={this.classes.headerRow}
            footerClassName={this.classes.footer}
            footRowClassName={this.classes.footerRow}
            cellClassName={this.classes.cell}
            data={tableData}
            columns={tableColumns}
            defaultSorted={[{id: 'row-title'}]}
            noPadding
            minRows={0}
            {...TableProps}
          />
        </div>
      </div>
    );
  }
}
