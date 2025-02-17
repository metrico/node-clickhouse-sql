const EQUALS = "=";
const EQ = EQUALS;
const GREATER = ">";
const GT = GREATER;
const GREATER_OR_EQUALS = ">=";
const GTE = GREATER_OR_EQUALS;
const LESS = "<";
const LT = LESS;
const LESS_OR_EQUALS = "<=";
const LTE = LESS_OR_EQUALS;
const NOT_EQUALS = "!=";
const NE = NOT_EQUALS;
const BETWEEN = "between";
const AND = 'and'

const Consts = {
  EQUALS,
  GREATER,
  GREATER_OR_EQUALS,
  LESS,
  LESS_OR_EQUALS,
  NOT_EQUALS,
  EQ,
  GT,
  GTE,
  LT,
  LTE,
  NE,
};

class SQLObject {
}

class Conditions extends SQLObject {
  constructor(...args) {
    super();
    this.args = args;
  }

  push(arg) {
    this.args.push(arg);
  }

  get length() {
    return this.args.length;
  }

  _argToStr(arg) {
    return (arg.toString) ? arg.toString() : arg;
  }

}

class Disjunction extends Conditions {
  constructor(...args) {
    super(...args);
  }

  toString() {
    const self = this;
    return this.args.length ? this.args.map(arg => `(${self._argToStr(arg)})`).join(" or ") : "";
  }
}

class Conjunction extends Conditions {
  constructor(...args) {
    super(...args);
  }

  toString() {
    if (!this.args.length) return "";
    const self = this;
    return this.args.map((arg) => `(${self._argToStr(arg)})`).join(" and ");
  }
}

class Condition extends SQLObject {
  constructor(column, operator, value) {
    super();
    this.column = quoteTerm(column);
    this.operator = operator;
    this.value = (value instanceof SQLObject) ? value : quoteVal(value);
  }

  toString() {
    if (this.operator) {
      return [this.column, this.operator, this.value].join(' ');
    } else {
      return this.column;
    }
  }
}

class Negation extends Condition {
  constructor(column, operator, value) {
    super(column, operator, value);
  }

  toString() {
    return "not(" + super.toString() + ")";
  }
}

class InclusionOperator extends Condition {
  constructor(inclusionType, column, operator, value) {
    super(column, operator, value);
    this.operator = inclusionType;
  }

  toString() {
    return [
      quoteTerm(this.column),
      " ",
      this.operator,
      " (",
      Array.isArray(this.value)
        ? this.value.map(val => quoteVal(val)).join(',')
        : quoteVal(this.value),
      ")"
    ].join('');
  }
}

class In extends InclusionOperator {
  constructor(column, operator, values) {
    super("in", column, operator, values);
  }
}

class NotIn extends InclusionOperator {
  constructor(column, operator, values) {
    super("not in", column, operator, values);
  }
}

class GlobalNotIn extends InclusionOperator {
  constructor(column, operator, values) {
    super("global not in", column, operator, values);
  }
}

class GlobalIn extends InclusionOperator {
  constructor(column, operator, values) {
    super("global in", column, operator, values);
  }
}

class Between extends SQLObject {
  constructor(column, leftBoundary, rightBoundary) {
      super();
      this.column = column;

      this.leftBoundary = leftBoundary;
      this.rightBoundary = rightBoundary;
  }
  quoteBoundary(b) {
    return b instanceof SQLObject ? b.toString() : quoteVal(b);
  }

  toString() {
    return [
      quoteTerm(this.column),
      " ",
      BETWEEN,
      // because super class adding parents around value and I didn't find an elegant
      // way how to avoid this. So I'm overloading toString() and copy-pasting implementation
      this.quoteBoundary(this.leftBoundary),
      AND,
      this.quoteBoundary(this.rightBoundary)
    ].join(' ');
  }
}

const Operators = {
  Conjunction, Disjunction, Negation,
  In, NotIn, GlobalIn, GlobalNotIn
};

function createCondition(...args) {
  switch (args.length) {
    case 1:
      return args[0] instanceof Condition ? args[0] : new Condition(args[0]);
    case 2:
      return new Condition(args[0], EQUALS, args[1]);
    case 3:
      return new Condition(...args);
    default:
      throw new Error("Invalid condition args: ", args);
  }
}

let commonReplacer = [
  /[\0\n\r\b\t\\\x1a]/g, (s) => {
    switch (s) {
      case "\0":
        return "\\0";
      case "\n":
        return "\\n";
      case "\b":
        return "\\b";
      case "\r":
        return "\\r";
      case "\t":
        return "\\t";
      case "\\":
        return "\\\\";
      case "\x1a" :
        return "\\Z";
      default:
        console.error("uncovered case in replacer:", s); return ''; //logic error
    }
  }
];

class Value extends SQLObject {
  constructor(value) {
    super();
    this.value = value;
  }

  toString() {
    if (typeof this.value === "string") {
      return "'" + this.value.replace(...commonReplacer).replace(/'/g, "''") + "'";
    }
    if (typeof this.value === 'undefined') {
      return "''";
    }

    if (Array.isArray(this.value)) {
      return this.value.map(val => new Value(val)).join();
    }

    return this.value + '';
  }
}

class Term extends SQLObject {
  constructor(term) {
    super();
    this.term = term;
  }

  toString() {
    const parts = this.term.split('.');
    if (parts.length > 1) {
      return [new Term(parts[0]).toString(), new Term(parts[1]).toString()].join('.');
    }

    return '`' + this.term.replace(...commonReplacer).replace(/`/g, '\\`') + '`';
  }
}

function quoteVal(value) {
  return value instanceof SQLObject ? value : new Value(value);
}

function quoteTerm(term) {
  return term instanceof SQLObject || Number.isFinite(term) ? term : new Term(term);
}


class SQLFunction extends SQLObject {
  constructor(name, ...args) {
    super();
    this.name = name;
    this.args = args;
  }

  toString() {
    return this.name +
      "(" +
      this.args.map((arg) => arg instanceof SQLObject || Number.isFinite(arg) ? arg : quoteTerm(arg)).join() +
      ")";
  }
}

const _curry_f = (name) => {
  return (...args) => new SQLFunction(name, ...args)
};

const AggregateFunctions = {
  count: _curry_f('count'),
  any: _curry_f('any'),
  anyLast: _curry_f('anyLast'),
  min: _curry_f('min'),
  max: _curry_f('max'),
  sum: _curry_f('sum'),
  avg: _curry_f('avg'),
  uniq: _curry_f('uniq'),
  uniqCombined: _curry_f('uniqCombined'),
  uniqHLL12: _curry_f('uniqHLL12'),
  uniqExact: _curry_f('uniqExact'),
  groupArray: _curry_f('groupArray'),
  groupUniqArray: _curry_f('groupUniqArray')
};

const ArithmeticFunctions = {
  plus: _curry_f('plus'),
  minus: _curry_f('minus'),
  multiply: _curry_f('multiply'),
  divide: _curry_f('divide'),
  intDiv: _curry_f('intDiv'),
  intDivOrZero: _curry_f('intDivOrZero'),
  modulo: _curry_f('modulo'),
  negate: _curry_f('negate'),
  abs: _curry_f('abs')
};

const TimeFunctions = {
  toYear: _curry_f('toYear'),
  toMonth: _curry_f('toMonth'),
  toDayOfMonth: _curry_f('toDayOfMonth'),
  toDayOfWeek: _curry_f('toDayOfWeek'),
  toHour: _curry_f('toHour'),
  toMinute: _curry_f('toMinute'),
  toTime: _curry_f('toTime'),
  toDate: _curry_f('toDate'),
  toDateTime: _curry_f('toDateTime'),
  toDateTime64: _curry_f('toDateTime64'),
  toStartOfDay: _curry_f('toStartOfDay'),
  toStartOfMonth: _curry_f('toStartOfMonth'),
  toStartOfQuarter: _curry_f('toStartOfQuarter'),
  toStartOfYear: _curry_f('toStartOfYear'),
  toStartOfMinute: _curry_f('toStartOfMinute'),
  toStartOfFiveMinute: _curry_f('toStartOfFiveMinute'),
  toStartOfHour: _curry_f('toStartOfHour'),

  now: _curry_f('now'),
  today: _curry_f('today'),
  yesterday: _curry_f('yesterday')
};

const IPAddrFunctions = {
  toIPv4: _curry_f('toIPv4'),
  toIPv6: _curry_f('toIPv6'),
  IPv4NumToString: _curry_f('IPv4NumToString'),
  IPv4StringToNum: _curry_f('IPv4StringToNum'),
  IPv4NumToStringClassC: _curry_f('IPv4NumToStringClassC'),
  IPv6NumToString: _curry_f('IPv6NumToString'),
  IPv6StringToNum: _curry_f('IPv6StringToNum')
};

class Raw extends SQLObject {
  constructor(string) {
    super();
    this.raw = string;
  }

  toString() {
    return this.raw;
  }
}

class Query extends SQLObject {
}

class Parameter extends SQLObject {
  constructor(name) {
    super()
    this.name = name;
    this.value = null;
  }
  set(value) {
    this.value = value;
  }
  get() {
    return this.value;
  }
  toString() {
    if (typeof this.value === 'undefined') {
      throw new Error('Unspecified parameter ' + this.name);
    }
    return this.value.toString();
  }
}

class With extends Query {
  constructor(alias, query, inline) {
    super();
    this.alias = alias;
    if (!query instanceof Select) {
      throw new Error('query should be a select query');
    }
    this.query = query;
    this.inline = inline;
  }
  toString() {
    if (this.inline) {
      return '';
    }
    this.fmt = undefined;
    return `${this.alias} AS (${this.query.toString()})`
  }
}

class WithReference extends SQLObject {
  constructor(ref) {
    super();
    if (!ref instanceof With) {
      throw new Error('reference should be a With object');
    }
    this.ref = ref;
  }
  toString() {
    if (this.ref.inline) {
      return `(${this.ref.query.toString()})`;
    }
    return this.ref.alias;
  }
}

class Subquery extends SQLObject {
  /**
   *
   * @param query {Select}
   */
  constructor(query) {
    super();
    this.query = query;
  }
  toString() {
    return `(${this.query})`;
  }
}

class UnionAll extends Query {
  constructor(...queries) {
    super();
    this.queries = queries;
  }
  toString() {
    return this.queries.join(' UNION ALL ');
  }
}

class Select extends Query {
  constructor() {
    super();
    this._init()
  }

  _init(q) {
    q = q || {};
    this.ctx = q.ctx || {};
    this.dist = false;
    this.params = q.params || {};
    this.withs = q.withs || {};
    this.tables = q.tables || [];
    this.joins = q.joins || [];
    this.conditions = q.conditions || new Conjunction();
    this.having_conditions = q.having_conditions || new Conjunction();
    this.preconditions = q.preconditions || new Conjunction();
    this.aggregations = q.aggregations || [];
    this.select_list = q.select_list || [];
    this.order_expressions = q.order_expressions || [];
    this.request_totals = q.request_totals || undefined;
    this.sampling = q.sampling || undefined;
    this.limits = q.limits || undefined;
    this.limitbycolumns = q.limitbycolumns || undefined;
    this.fmt = q.fmt || undefined;
  }

  distinct(dist) {
    this.dist = dist;
    return this;
  }

  clone() {
    const s = new Select();
    s._init(this);
    return s;
  }

  select(...columns) {
    if (columns.length === 0) {
      return this.select_list;
    }

    columns.forEach((col) => this.select_list.push(col));
    return this;
  }

  /**
   *
   * @param queries {With}
   */
  with(...queries) {
    if (!queries.length) {
      return this.withs;
    }
    let withs = [];
    for (const q of queries) {
      withs.push.apply(withs, Object.values(q.query.withs ? q.query.withs : {}));
      this.ctx = {...this.ctx, ...q.query.ctx};
      this.params = {...this.params, ...q.query.params};
      q.query.withs = {};
    }
    withs = [...withs, ...queries]
    for (const q of withs) {
      this.withs[q.alias] = q;
      this.fmt = q.query.fmt || this.fmt;
      q.query.fmt = undefined;
    }
    return this;
  }

  /**
   *
   * @param param {Parameter}
   */
  addParam(param) {
    this.params[param.name] = param
    return this;
  }

  /**
   *
   * @param name {string}
   */
  getParam(name) {
    return this.params[name];
  }

  /**
   * @usage
   *  q = selectBuilder->from('table0', ['table1', 'alias1'], { 'table2' : 'alias2'})->toString()
   *  assertEquals(q, "select * from table0, table1 as alias1, table2 as alias2");
   *
   * @param tables
   * @return {Select|Array}
   */
  from(...tables) {
    if (!tables.length) {
      return this.tables;
    }

    tables = tables.map(table => {
      if (typeof table === "string") return [quoteTerm(table)];
      if (Array.isArray(table)) {
        if (table[0] instanceof Query) table[0] = new Subquery(table[0]);
        else if (table[0] instanceof SQLObject) table[0] = table[0];
        else table[0] = quoteTerm(table[0]);
        table[1] = quoteTerm(table[1]);
        return table;
      }
      if (table instanceof Query) return [new Subquery(table)];
      if (table instanceof SQLObject) return [table];

      let alias = Object.values(table)[0];
      if (alias instanceof Select) alias = '(' + alias.toString() + ')';
      else alias = quoteTerm(alias);

      return [alias, quoteTerm(Object.keys(table)[0])];
    });

    this.tables = tables;
    return this;
  }

  join(table, type, ...conditions) {
    if (typeof table === "string") table = quoteTerm(table);

    if (!Array.isArray(conditions)) {
      conditions = [conditions];
    }

    if (conditions.length > 1) {
      conditions = Conjunction(conditions);
    }

    this.joins.push({ table, type, conditions });
    return this;
  }

  prewhere(...args) {
    this.preconditions.push(createCondition(...args));
    return this;
  }

  orPrewhere(...args) {
    let condition = createCondition(...args);
    if (this.preconditions.length) {
      this.preconditions = new Disjunction(this.preconditions, condition)
    } else {
      this.preconditions.push(condition)
    }

    return this;
  }

  where(...args) {
    if (args.length === 1 && args[0] instanceof Condition) {
      this.conditions.push(args[0]);
    } else {
      this.conditions.push(createCondition(...args));
    }
    return this;
  }

  orWhere(...args) {
    let condition = createCondition(...args);
    if (this.conditions.length) {
      this.conditions = new Disjunction(this.conditions, condition)
    } else {
      this.conditions.push(condition);
    }

    return this;
  }

  groupBy(...aggregateExpressions) {
    aggregateExpressions.forEach(a => this.aggregations.push(a));
    return this;
  }

  withTotals(request_totals = true) {
    this.request_totals = request_totals;
    return this;
  }

  limit(number, offset) {
    if (!number && !offset) {
      this.limits = undefined
      return this
    }
    this.limits = {
      number, offset
    };
    return this;
  }

  limitBy(limit, ...columns) {
    this.limitbycolumns = {
      limit, columns
    };
    return this;
  }

  orderBy(...expressions) {
    if (!expressions.length) {
      return this.order_expressions;
    }
    this.order_expressions = expressions;
    return this;
  }

  format(fmt) {
    this.fmt = fmt;
    return this;
  }

  having(...args) {
    if (!args.length) {
      return this.having_conditions;
    }
    if (args.length === 1 && args[0] instanceof Condition) {
      this.having_conditions.push(args[0]);
    } else {
      this.having_conditions.push(createCondition(...args));
    }
    return this;
  }

  toString() {
    let wth = Object.values(this.with()).filter(w => !w.inline);
    wth = wth.length ? "WITH " + wth.join(', ') : '';
    let select_list;
    if (this.select_list.length === 0) {
      select_list = "*";
    } else {
      select_list = this.select_list.map(
        c => Array.isArray(c)
          ? quoteTerm(c[0]) + ' as ' + quoteTerm(c[1])
          : quoteTerm(c)
      ).join();
    }

    const dist = this.dist ? 'DISTINCT' : '';

    let from = this.from().map(
      (table) =>
        table.length === 1
          ? table[0]
          : table[0] + ' as ' + table[1]
    );
    from = from.length ? "from " + from.join() : "";

    let join = this.joins.map((join) => {
      const table = Array.isArray(join.table) && join.table.length > 1
        ? [quoteTerm(join.table[0]), join.table[1]].join(' as ')
        : join.table;
      return ((join.type) ? join.type + ' ' : '') + 'join ' + table +
        (join.type === 'array' ? ' ' : ' on ' + join.conditions);
    }).join(' ');

    let prewhere = this.preconditions.length ? "prewhere " + this.preconditions : "";
    let where = this.conditions.length ? "where " + this.conditions : "";

    let groupby = this.aggregations.length
      ? "group by " + this.aggregations.map(c => quoteTerm(c)).join()
      : "";

    let having = this.having_conditions.length ? "having " + this.having_conditions : "";

    let order_by = this.order_expressions.length
      ? "order by " + this.order_expressions.map(e => Array.isArray(e) ? quoteTerm(e[0]) + " " + e[1] : quoteTerm(e)).join()
      : "";

    let with_totals = this.request_totals ? "with totals" : "";
    let sample = this.sampling ? "sample " + this.sampling : "";

    let limitby = this.limitbycolumns && this.limitbycolumns.columns.length
      ? "limit " + this.limitbycolumns.limit + " by " + this.limitbycolumns.columns.map(c => quoteTerm(c)).join()
      : '';


    let limit_number = this.limits && typeof this.limits.number !== "undefined"
      ? this.limits.number.toString() : undefined;
    let limit_offset = this.limits && typeof this.limits.offset !== "undefined"
      ? this.limits.offset.toString() : undefined;
    let limit = limit_number || limit_offset
      ? "limit " + ((typeof limit_offset === "undefined") ? limit_number : limit_offset + ", " + limit_number)
      : '';

    let format = this.fmt
      ? " format " + this.fmt.toUpperCase()
      : "";

    const parts = [
      wth,
      "select",
      dist,
      select_list,
      from,
      join,
      sample,
      prewhere,
      where,
      groupby,
      with_totals,
      having,
      order_by,
      limitby,
      limit,
      format,
    ].filter((v) => v && v != '');

    return parts.join(' ');
  }
}


const Queries = {
  Select,
  With,
  WithReference,
  Raw,
  UnionAll
};


const Utility = {
  quoteVal, val: quoteVal,
  quoteTerm, term: quoteTerm,
  raw: (s) => new Raw(s),
  Condition: (...args) => new Condition(...args),
  Parameter
};


const Shortcuts = {
  And: (...args) => new Conjunction(...args),
  Or: (...args) => new Disjunction(...args),
  Eq: (col, val) => new Condition(col, Consts.EQ, val),
  Ne: (col, val) => new Condition(col, Consts.NE, val),
  Gte: (col, val) => new Condition(col, Consts.GTE, val),
  Lte: (col, val) => new Condition(col, Consts.LTE, val),
  Lt: (col, val) => new Condition(col, Consts.LT, val),
  Gt: (col, val) => new Condition(col, Consts.GT, val),
  in: (col, values) => new In(col, null, values),
  notIn: (col, values) => new NotIn(col, null, values),
  cast: (thing, t) => new SQLFunction('cast', thing, quoteVal(t)),
  between: (col, left, right) => new Between(col, left, right)
};


const Dialect = {
  ...Operators,
  ...AggregateFunctions,
  ...ArithmeticFunctions,
  ...TimeFunctions,
  ...IPAddrFunctions,
  ...Consts,
  ...Queries,
  ...Utility,
  ...Shortcuts,
};
export default Dialect;
