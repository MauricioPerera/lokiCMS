/**
 * LokiJS Modernized - ResultSet
 *
 * Proporciona una interfaz de consultas encadenables (chainable) para filtrar,
 * ordenar y transformar documentos de una colección. ResultSet opera sobre
 * índices de filas en lugar de copiar documentos, lo que permite operaciones
 * eficientes en memoria.
 *
 * @module resultset
 *
 * @example
 * ```typescript
 * // Consulta básica encadenada
 * const results = collection.chain()
 *   .find({ status: 'active' })
 *   .where(doc => doc.age >= 18)
 *   .simplesort('name')
 *   .limit(10)
 *   .data();
 *
 * // Paginación
 * const page2 = collection.chain()
 *   .find({ category: 'electronics' })
 *   .simplesort('price', true) // descendente
 *   .offset(20)
 *   .limit(10)
 *   .data();
 *
 * // Transformaciones
 * const names = collection.chain()
 *   .find({ active: true })
 *   .map(doc => doc.name);
 *
 * // Agregación
 * const total = collection.chain()
 *   .find({ type: 'sale' })
 *   .reduce((sum, doc) => sum + doc.amount, 0);
 * ```
 */

import type { Collection } from './collection.js';
import type { Doc, Query, SortCriteria, SimpleSortOptions } from './types.js';
import { matchesQuery, createComparator, createCompoundComparator } from './operators.js';
import { clone } from './utils.js';

/**
 * ResultSet - Interfaz de consultas encadenables para colecciones LokiJS.
 *
 * Permite construir consultas complejas mediante encadenamiento de métodos,
 * similar a los fluent builders o LINQ. Opera de forma lazy, manteniendo
 * solo índices a las filas que coinciden hasta que se materialicen los
 * resultados con `data()` o `toArray()`.
 *
 * @typeParam T - Tipo de los documentos en la colección (sin metadatos Loki)
 *
 * @example
 * ```typescript
 * interface User {
 *   name: string;
 *   age: number;
 *   department: string;
 * }
 *
 * const users = db.addCollection<User>('users');
 *
 * // Crear ResultSet y encadenar operaciones
 * const seniors = users.chain()
 *   .find({ department: 'Engineering' })
 *   .where(u => u.age >= 50)
 *   .simplesort('name')
 *   .data();
 * ```
 */
export class ResultSet<T extends object> {
  /** Referencia a la colección fuente */
  private collection: Collection<T>;

  /** Índices de las filas que coinciden con los filtros aplicados */
  private filteredRows: number[];

  /** Indica si se ha inicializado el filtro (lazy initialization) */
  private filterInitialized: boolean;

  /**
   * Crea una nueva instancia de ResultSet.
   *
   * @param collection - Colección sobre la que operar
   * @param options - Opciones de inicialización
   * @param options.firstOnly - Si es true, solo incluye el primer documento
   *
   * @example
   * ```typescript
   * // Normalmente se crea a través de collection.chain()
   * const rs = collection.chain();
   *
   * // O con firstOnly para findOne optimizado
   * const rs = new ResultSet(collection, { firstOnly: true });
   * ```
   */
  constructor(collection: Collection<T>, options?: { firstOnly?: boolean }) {
    this.collection = collection;
    this.filteredRows = [];
    this.filterInitialized = false;

    if (options?.firstOnly) {
      this.filteredRows = collection.data.length > 0 ? [0] : [];
      this.filterInitialized = true;
    }
  }

  /**
   * Reinicia el ResultSet a su estado inicial.
   *
   * Limpia todos los filtros aplicados, permitiendo reutilizar
   * el ResultSet para una nueva consulta.
   *
   * @returns El mismo ResultSet para encadenamiento
   *
   * @example
   * ```typescript
   * const rs = collection.chain().find({ active: true });
   * const activeCount = rs.count();
   *
   * rs.reset();
   * const totalCount = rs.count(); // Ahora cuenta todos
   * ```
   */
  reset(): this {
    this.filteredRows = [];
    this.filterInitialized = false;
    return this;
  }

  /**
   * Convierte los resultados filtrados a un array de documentos.
   *
   * Si no se han aplicado filtros, retorna una copia de todos los
   * documentos de la colección. Crea una copia del array para
   * prevenir mutaciones accidentales.
   *
   * @returns Array de documentos que coinciden con los filtros
   *
   * @example
   * ```typescript
   * const docs = collection.chain()
   *   .find({ status: 'pending' })
   *   .toArray();
   * ```
   */
  toArray(): Doc<T>[] {
    if (!this.filterInitialized) {
      return [...this.collection.data];
    }
    return this.filteredRows.map(idx => this.collection.data[idx]!);
  }

  /**
   * Obtiene los resultados con opciones adicionales de procesamiento.
   *
   * Este es el método principal para materializar los resultados de una
   * consulta. Soporta clonación de documentos y eliminación de metadatos.
   *
   * @param options - Opciones de procesamiento
   * @param options.forceClones - Fuerza la clonación de documentos
   * @param options.removeMeta - Elimina los metadatos Loki ($loki, meta)
   * @returns Array de documentos procesados
   *
   * @example
   * ```typescript
   * // Obtener resultados clonados (seguros para modificar)
   * const docs = collection.chain()
   *   .find({ type: 'user' })
   *   .data({ forceClones: true });
   *
   * // Obtener sin metadatos (para API responses)
   * const cleanDocs = collection.chain()
   *   .find({})
   *   .data({ removeMeta: true });
   * ```
   */
  data(options?: { forceClones?: boolean; removeMeta?: boolean }): Doc<T>[] {
    let result = this.toArray();

    if (options?.forceClones || this.collection.cloneObjects) {
      result = result.map(doc => clone(doc, this.collection.cloneMethod));
    }

    if (options?.removeMeta) {
      result = result.map(doc => {
        const { meta, ...rest } = doc;
        return rest as Doc<T>;
      });
    }

    return result;
  }

  /**
   * Obtiene el conteo de documentos sin materializar los resultados.
   *
   * Más eficiente que `data().length` porque no crea copias de documentos.
   *
   * @returns Número de documentos que coinciden
   *
   * @example
   * ```typescript
   * const activeUsers = collection.chain()
   *   .find({ active: true })
   *   .count();
   *
   * console.log(`Hay ${activeUsers} usuarios activos`);
   * ```
   */
  count(): number {
    if (!this.filterInitialized) {
      return this.collection.data.length;
    }
    return this.filteredRows.length;
  }

  /**
   * Filtra documentos usando un objeto de consulta MongoDB-like.
   *
   * Soporta operadores de comparación ($eq, $gt, $lt, $in, etc.),
   * operadores lógicos ($and, $or, $not) y operadores de strings/arrays.
   *
   * @param query - Objeto de consulta con condiciones
   * @returns El mismo ResultSet para encadenamiento
   *
   * @example
   * ```typescript
   * // Consulta simple
   * collection.chain().find({ name: 'John' });
   *
   * // Con operadores
   * collection.chain().find({
   *   age: { $gte: 18, $lt: 65 },
   *   status: { $in: ['active', 'pending'] }
   * });
   *
   * // Operadores lógicos
   * collection.chain().find({
   *   $or: [
   *     { role: 'admin' },
   *     { permissions: { $contains: 'write' } }
   *   ]
   * });
   * ```
   */
  find(query?: Query<T>): this {
    if (!this.filterInitialized) {
      // Initialize with all rows
      this.filteredRows = this.collection.data.map((_, idx) => idx);
      this.filterInitialized = true;
    }

    if (!query || Object.keys(query).length === 0) {
      return this;
    }

    // Check if we can use binary index
    const indexedField = this.getIndexableField(query);
    if (indexedField) {
      this.filteredRows = this.applyBinaryIndex(indexedField, query);
    } else {
      this.filteredRows = this.filteredRows.filter(idx => {
        const doc = this.collection.data[idx];
        return doc && matchesQuery(doc, query);
      });
    }

    return this;
  }

  /**
   * Filtra documentos usando una función personalizada.
   *
   * Útil para condiciones complejas que no pueden expresarse
   * fácilmente con el objeto de consulta.
   *
   * @param fn - Función que recibe un documento y retorna true para incluirlo
   * @returns El mismo ResultSet para encadenamiento
   *
   * @example
   * ```typescript
   * // Filtro con lógica compleja
   * collection.chain()
   *   .where(doc => {
   *     const age = calculateAge(doc.birthDate);
   *     return age >= 18 && doc.country === 'MX';
   *   });
   *
   * // Combinar con find
   * collection.chain()
   *   .find({ active: true })
   *   .where(doc => doc.score > doc.threshold);
   * ```
   */
  where(fn: (doc: Doc<T>) => boolean): this {
    if (!this.filterInitialized) {
      this.filteredRows = this.collection.data.map((_, idx) => idx);
      this.filterInitialized = true;
    }

    this.filteredRows = this.filteredRows.filter(idx => {
      const doc = this.collection.data[idx];
      return doc && fn(doc);
    });

    return this;
  }

  /**
   * Ordena los resultados por un solo campo.
   *
   * @param property - Nombre del campo por el cual ordenar
   * @param options - Opciones de ordenamiento o boolean para descendente
   * @returns El mismo ResultSet para encadenamiento
   *
   * @example
   * ```typescript
   * // Orden ascendente (por defecto)
   * collection.chain().simplesort('name');
   *
   * // Orden descendente
   * collection.chain().simplesort('createdAt', true);
   * collection.chain().simplesort('price', { desc: true });
   * ```
   */
  simplesort(property: keyof T, options?: SimpleSortOptions | boolean): this {
    const desc = typeof options === 'boolean' ? options : options?.desc ?? false;

    if (!this.filterInitialized) {
      this.filteredRows = this.collection.data.map((_, idx) => idx);
      this.filterInitialized = true;
    }

    const comparator = createComparator(property, desc);

    this.filteredRows.sort((a, b) => {
      const docA = this.collection.data[a];
      const docB = this.collection.data[b];
      if (!docA || !docB) return 0;
      return comparator(docA, docB);
    });

    return this;
  }

  /**
   * Ordena los resultados por múltiples campos.
   *
   * Aplica ordenamiento en cascada: si dos documentos son iguales
   * en el primer campo, se comparan por el segundo, y así sucesivamente.
   *
   * @param criteria - Array de criterios de ordenamiento
   * @returns El mismo ResultSet para encadenamiento
   *
   * @example
   * ```typescript
   * // Ordenar por departamento ASC, luego por salario DESC
   * collection.chain().compoundsort([
   *   ['department', false],  // [campo, descendente]
   *   ['salary', true]
   * ]);
   *
   * // Con objetos SortCriteria
   * collection.chain().compoundsort([
   *   { property: 'category', desc: false },
   *   { property: 'price', desc: true }
   * ]);
   * ```
   */
  compoundsort(criteria: Array<[keyof T, boolean]> | SortCriteria<T>[]): this {
    if (!this.filterInitialized) {
      this.filteredRows = this.collection.data.map((_, idx) => idx);
      this.filterInitialized = true;
    }

    // Normalize criteria
    const normalizedCriteria: Array<[keyof T, boolean]> = criteria.map(
      (c: [keyof T, boolean] | SortCriteria<T>) => {
        if (Array.isArray(c)) {
          return c as [keyof T, boolean];
        }
        return [c as keyof T, false] as [keyof T, boolean];
      }
    );

    const comparator = createCompoundComparator(normalizedCriteria);

    this.filteredRows.sort((a, b) => {
      const docA = this.collection.data[a];
      const docB = this.collection.data[b];
      if (!docA || !docB) return 0;
      return comparator(docA, docB);
    });

    return this;
  }

  /**
   * Ordena usando una función de comparación personalizada.
   *
   * @param comparator - Función que compara dos documentos
   * @returns El mismo ResultSet para encadenamiento
   *
   * @example
   * ```typescript
   * // Ordenamiento personalizado por distancia
   * collection.chain().sort((a, b) => {
   *   const distA = calculateDistance(a.coords, userCoords);
   *   const distB = calculateDistance(b.coords, userCoords);
   *   return distA - distB;
   * });
   * ```
   */
  sort(comparator: (a: Doc<T>, b: Doc<T>) => number): this {
    if (!this.filterInitialized) {
      this.filteredRows = this.collection.data.map((_, idx) => idx);
      this.filterInitialized = true;
    }

    this.filteredRows.sort((a, b) => {
      const docA = this.collection.data[a];
      const docB = this.collection.data[b];
      if (!docA || !docB) return 0;
      return comparator(docA, docB);
    });

    return this;
  }

  /**
   * Limita el número de resultados.
   *
   * Típicamente usado junto con `offset()` para paginación.
   *
   * @param qty - Número máximo de documentos a retornar
   * @returns El mismo ResultSet para encadenamiento
   *
   * @example
   * ```typescript
   * // Obtener los primeros 10
   * collection.chain().limit(10).data();
   *
   * // Top 5 por puntuación
   * collection.chain()
   *   .simplesort('score', true)
   *   .limit(5)
   *   .data();
   * ```
   */
  limit(qty: number): this {
    if (!this.filterInitialized) {
      this.filteredRows = this.collection.data.map((_, idx) => idx);
      this.filterInitialized = true;
    }

    this.filteredRows = this.filteredRows.slice(0, qty);
    return this;
  }

  /**
   * Salta un número de resultados desde el inicio.
   *
   * Típicamente usado junto con `limit()` para paginación.
   *
   * @param pos - Número de documentos a saltar
   * @returns El mismo ResultSet para encadenamiento
   *
   * @example
   * ```typescript
   * // Página 3 con 10 items por página
   * const page = 3;
   * const pageSize = 10;
   * collection.chain()
   *   .offset((page - 1) * pageSize)
   *   .limit(pageSize)
   *   .data();
   * ```
   */
  offset(pos: number): this {
    if (!this.filterInitialized) {
      this.filteredRows = this.collection.data.map((_, idx) => idx);
      this.filterInitialized = true;
    }

    this.filteredRows = this.filteredRows.slice(pos);
    return this;
  }

  /**
   * Transforma cada documento a una nueva forma.
   *
   * Similar a `Array.prototype.map()`. Materializa los resultados.
   *
   * @typeParam U - Tipo del resultado transformado
   * @param mapFn - Función de transformación
   * @returns Array con los resultados transformados
   *
   * @example
   * ```typescript
   * // Extraer solo nombres
   * const names = collection.chain()
   *   .find({ active: true })
   *   .map(doc => doc.name);
   *
   * // Transformar a DTOs
   * const dtos = collection.chain()
   *   .find({})
   *   .map(doc => ({
   *     id: doc.id,
   *     displayName: `${doc.firstName} ${doc.lastName}`
   *   }));
   * ```
   */
  map<U>(mapFn: (doc: Doc<T>) => U): U[] {
    return this.toArray().map(mapFn);
  }

  /**
   * Reduce los documentos a un valor único.
   *
   * Similar a `Array.prototype.reduce()`. Materializa los resultados.
   *
   * @typeParam U - Tipo del valor acumulado
   * @param reduceFn - Función reductora
   * @param initialValue - Valor inicial del acumulador
   * @returns El valor reducido final
   *
   * @example
   * ```typescript
   * // Sumar totales
   * const totalSales = collection.chain()
   *   .find({ type: 'sale' })
   *   .reduce((sum, doc) => sum + doc.amount, 0);
   *
   * // Agrupar por categoría
   * const byCategory = collection.chain()
   *   .find({})
   *   .reduce((groups, doc) => {
   *     const cat = doc.category;
   *     groups[cat] = groups[cat] || [];
   *     groups[cat].push(doc);
   *     return groups;
   *   }, {} as Record<string, Doc<T>[]>);
   * ```
   */
  reduce<U>(reduceFn: (acc: U, doc: Doc<T>) => U, initialValue: U): U {
    return this.toArray().reduce(reduceFn, initialValue);
  }

  /**
   * Obtiene el primer documento de los resultados.
   *
   * @returns El primer documento o null si no hay resultados
   *
   * @example
   * ```typescript
   * const oldest = collection.chain()
   *   .simplesort('createdAt')
   *   .first();
   *
   * const admin = collection.chain()
   *   .find({ role: 'admin' })
   *   .first();
   * ```
   */
  first(): Doc<T> | null {
    if (!this.filterInitialized) {
      return this.collection.data[0] ?? null;
    }
    const idx = this.filteredRows[0];
    return idx !== undefined ? this.collection.data[idx] ?? null : null;
  }

  /**
   * Obtiene el último documento de los resultados.
   *
   * @returns El último documento o null si no hay resultados
   *
   * @example
   * ```typescript
   * const newest = collection.chain()
   *   .simplesort('createdAt')
   *   .last();
   *
   * const mostExpensive = collection.chain()
   *   .simplesort('price')
   *   .last();
   * ```
   */
  last(): Doc<T> | null {
    if (!this.filterInitialized) {
      return this.collection.data[this.collection.data.length - 1] ?? null;
    }
    const idx = this.filteredRows[this.filteredRows.length - 1];
    return idx !== undefined ? this.collection.data[idx] ?? null : null;
  }

  /**
   * Actualiza todos los documentos que coinciden con los filtros.
   *
   * Aplica una función de transformación a cada documento y lo
   * persiste en la colección.
   *
   * @param updateFn - Función que recibe un documento y retorna el actualizado
   * @returns El mismo ResultSet para encadenamiento
   *
   * @example
   * ```typescript
   * // Incrementar contador en documentos filtrados
   * collection.chain()
   *   .find({ status: 'pending' })
   *   .update(doc => ({ ...doc, retryCount: doc.retryCount + 1 }));
   *
   * // Marcar como procesados
   * collection.chain()
   *   .find({ processed: false })
   *   .update(doc => ({ ...doc, processed: true, processedAt: Date.now() }));
   * ```
   */
  update(updateFn: (doc: Doc<T>) => Doc<T>): this {
    const docs = this.toArray();
    for (const doc of docs) {
      const updated = updateFn(doc);
      this.collection.update(updated);
    }
    return this;
  }

  /**
   * Elimina todos los documentos que coinciden con los filtros.
   *
   * ⚠️ Esta operación es destructiva y no puede deshacerse.
   *
   * @returns El mismo ResultSet (vacío después de la operación)
   *
   * @example
   * ```typescript
   * // Eliminar documentos antiguos
   * const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
   * collection.chain()
   *   .find({ createdAt: { $lt: thirtyDaysAgo } })
   *   .remove();
   *
   * // Eliminar por status
   * collection.chain()
   *   .find({ status: 'deleted' })
   *   .remove();
   * ```
   */
  remove(): this {
    const docs = this.toArray();
    for (const doc of docs) {
      this.collection.remove(doc);
    }
    this.filteredRows = [];
    return this;
  }

  /**
   * Crea una copia independiente del ResultSet.
   *
   * Útil cuando se quiere mantener el estado actual mientras
   * se aplican operaciones adicionales.
   *
   * @returns Nuevo ResultSet con el mismo estado
   *
   * @example
   * ```typescript
   * const baseQuery = collection.chain().find({ department: 'Sales' });
   *
   * const seniorSales = baseQuery.copy()
   *   .where(doc => doc.yearsExp >= 5)
   *   .data();
   *
   * const juniorSales = baseQuery.copy()
   *   .where(doc => doc.yearsExp < 5)
   *   .data();
   * ```
   */
  copy(): ResultSet<T> {
    const rs = new ResultSet(this.collection);
    rs.filteredRows = [...this.filteredRows];
    rs.filterInitialized = this.filterInitialized;
    return rs;
  }

  /**
   * Crea una rama del ResultSet para operaciones paralelas.
   *
   * Alias de `copy()`. Permite bifurcar una consulta para aplicar
   * diferentes operaciones al mismo conjunto base.
   *
   * @returns Nuevo ResultSet con el mismo estado
   *
   * @example
   * ```typescript
   * const activeUsers = collection.chain().find({ active: true });
   *
   * // Rama 1: ordenar por nombre
   * const byName = activeUsers.branch().simplesort('name').data();
   *
   * // Rama 2: ordenar por fecha
   * const byDate = activeUsers.branch().simplesort('createdAt', true).data();
   * ```
   */
  branch(): ResultSet<T> {
    return this.copy();
  }

  /**
   * Verifica si un campo de la consulta puede usar índice binario.
   *
   * Solo consultas de igualdad simple en campos indexados pueden
   * beneficiarse del índice binario.
   *
   * @param query - Objeto de consulta a analizar
   * @returns Nombre del campo indexable o null
   * @private
   */
  private getIndexableField(query: Query<T>): keyof T | null {
    const keys = Object.keys(query);
    if (keys.length !== 1) return null;

    const key = keys[0] as keyof T;
    if (!this.collection.binaryIndices[key as string]) return null;

    const value = query[key];
    // Only simple equality can use binary index efficiently
    if (typeof value !== 'object' || value === null) {
      return key;
    }

    return null;
  }

  /**
   * Aplica un índice binario para búsqueda optimizada.
   *
   * @param field - Campo con índice binario
   * @param query - Consulta a aplicar
   * @returns Índices de filas que coinciden
   * @private
   */
  private applyBinaryIndex(field: keyof T, query: Query<T>): number[] {
    const index = this.collection.binaryIndices[field as string];
    if (!index) {
      return this.filteredRows;
    }

    const value = query[field];
    const result: number[] = [];

    // Binary search in index
    for (const idx of index.values) {
      const doc = this.collection.data[idx];
      if (doc && (doc as T)[field] === value) {
        result.push(idx);
      }
    }

    // Apply additional filters if any
    return result.filter(idx => {
      const doc = this.collection.data[idx];
      return doc && matchesQuery(doc, query);
    });
  }

  /**
   * Une resultados con otra colección (equi-join).
   *
   * Realiza un join basado en igualdad de campos entre dos colecciones.
   * Similar a un LEFT JOIN en SQL.
   *
   * @typeParam U - Tipo de documentos en la colección derecha
   * @typeParam R - Tipo del resultado del join
   * @param joinCollection - Colección o array con el que unir
   * @param leftJoinKey - Campo de este ResultSet para el join
   * @param rightJoinKey - Campo de la colección derecha para el join
   * @param mapFn - Función opcional para transformar cada par de documentos
   * @returns Array con los resultados del join
   *
   * @example
   * ```typescript
   * interface Order { id: string; userId: string; total: number; }
   * interface User { id: string; name: string; }
   *
   * // Join básico
   * const ordersWithUsers = orders.chain()
   *   .find({ status: 'completed' })
   *   .eqJoin(users, 'userId', 'id');
   * // Resultado: { left: Order, right: User | null }[]
   *
   * // Join con transformación
   * const orderSummaries = orders.chain()
   *   .find({})
   *   .eqJoin(users, 'userId', 'id', (order, user) => ({
   *     orderId: order.id,
   *     total: order.total,
   *     customerName: user?.name ?? 'Unknown'
   *   }));
   * ```
   */
  eqJoin<U extends object, R>(
    joinCollection: Collection<U> | Doc<U>[],
    leftJoinKey: keyof T,
    rightJoinKey: keyof U,
    mapFn?: (left: Doc<T>, right: Doc<U> | null) => R
  ): R[] {
    const rightData = Array.isArray(joinCollection)
      ? joinCollection
      : joinCollection.data;

    // Create lookup map for right collection
    const rightMap = new Map<unknown, Doc<U>>();
    for (const doc of rightData) {
      rightMap.set(doc[rightJoinKey], doc);
    }

    const results: R[] = [];
    const leftDocs = this.toArray();

    for (const leftDoc of leftDocs) {
      const leftKey = leftDoc[leftJoinKey];
      const rightDoc = rightMap.get(leftKey) ?? null;

      if (mapFn) {
        results.push(mapFn(leftDoc, rightDoc));
      } else {
        results.push({ left: leftDoc, right: rightDoc } as R);
      }
    }

    return results;
  }
}
