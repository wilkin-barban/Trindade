package com.trindade.app.salida

/**
 * El catálogo de la baja, tal como la planta lo fijó.
 *
 * Son diecinueve productos en tres bloques, con el orden que el operario ve en la web: primero las
 * embalagens, después las bobinas y al final la matéria-prima. El código viaja con cuatro dígitos en la
 * pantalla y con seis hacia el ERP; la cantidad se escribe en unidades enteras y el ERP la recibe por cien.
 */
object SalidaCatalog {

    const val BLOCK_EMBALAGENS = "embalagens"
    const val BLOCK_BOBINAS = "bobinas"
    const val BLOCK_MATERIA_PRIMA = "materia-prima"

    /** Los bloques en el orden en que se dibujan y se envían. */
    val blocks = listOf(BLOCK_EMBALAGENS, BLOCK_BOBINAS, BLOCK_MATERIA_PRIMA)

    data class Product(val code: String, val name: String, val block: String)

    val products: List<Product> = listOf(
        Product("1357", "EMBALAG. DISCO 200g", BLOCK_EMBALAGENS),
        Product("1356", "EMBALAG. DISCO 400g", BLOCK_EMBALAGENS),
        Product("1355", "EMBALAG. DISCO 500g", BLOCK_EMBALAGENS),
        Product("1358", "EMBALAG. LASANHA", BLOCK_EMBALAGENS),
        Product("1359", "EMBALAG. CASEIRA", BLOCK_EMBALAGENS),
        Product("1361", "EMBALAG. QUADRADA", BLOCK_EMBALAGENS),
        Product("1307", "EMBALAG. ROLO 1kg", BLOCK_EMBALAGENS),
        Product("1625", "EMBALAG. TOKO", BLOCK_EMBALAGENS),
        Product("1354", "EMBALAG. ROLO 500g", BLOCK_EMBALAGENS),
        Product("1528", "EMBALAG. ROLO 2kg", BLOCK_EMBALAGENS),
        Product("1781", "EMBALAG. TEMPERO", BLOCK_EMBALAGENS),
        Product("1900", "BOBINA ROLO", BLOCK_BOBINAS),
        Product("1899", "BOBINA LASANHA", BLOCK_BOBINAS),
        Product("1898", "BOBINA DISCO", BLOCK_BOBINAS),
        Product("1012", "SORBATO", BLOCK_MATERIA_PRIMA),
        Product("1011", "PROPIONATO", BLOCK_MATERIA_PRIMA),
        Product("1068", "MICRO SAL", BLOCK_MATERIA_PRIMA),
        Product("1074", "AÇÚCAR 5kg", BLOCK_MATERIA_PRIMA),
        Product("1673", "GORDURA VEGETAL", BLOCK_MATERIA_PRIMA),
    )

    private val byCode = products.associateBy { it.code }

    fun product(code: String): Product? = byCode[code.trim()]

    /** Lo que la pantalla muestra: el código tal como se escribe acá. */
    fun displayCode(code: String): String = code.trim()

    /** Lo que el ERP recibe: seis dígitos, con ceros a la izquierda. */
    fun erpCode(code: String): String = code.trim().padStart(6, '0')

    /**
     * La cantidad que el operario escribe: el bloque de texto acepta cualquier cosa y esta es la que decide.
     *
     * Enteros mayores que cero, y nada más: un `0` dejaría una línea que no sale, un decimal la haría salir
     * multiplicada por cien sin que nadie lo haya pedido, y una letra la haría salir en cero.
     */
    fun quantity(raw: String): Int = raw.trim().toIntOrNull()?.takeIf { it > 0 } ?: 0

    /** La cantidad hacia el ERP: la fábrica cuenta unidades, el ERP recibe centésimos. */
    fun erpQuantity(quantity: Int): Int = quantity * 100

    /** Los productos de un bloque, en el orden del catálogo. */
    fun inBlock(block: String): List<Product> = products.filter { it.block == block }
}
