
require("dotenv").config();
const axios = require("axios");

// ======================================================
// SHOPIFY + GOOGLE IMAGE AUTOMATION
// TEST: 10 SKU
// FOTO: SQUARE 1:1
// ======================================================

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

const API_VERSION =
  process.env.API_VERSION || "2026-07";

const GOOGLE_API_KEY =
  process.env.GOOGLE_API_KEY;

const GOOGLE_CX =
  process.env.GOOGLE_CX;

const SHOPIFY_URL =
  `https://${SHOPIFY_STORE}/admin/api/${API_VERSION}/graphql.json`;


// ======================================================
// 10 SKU-TË E PARA
// ======================================================

const TEST_SKUS = [
  "0110",
  "0454",
  "0482",
  "0496",
  "0504",
  "0505",
  "0512",
  "0520",
  "0523",
  "0525"
];


// ======================================================
// CHECK .ENV
// ======================================================

if (!SHOPIFY_STORE) {
  throw new Error(
    "❌ Mungon SHOPIFY_STORE në .env"
  );
}

if (!SHOPIFY_ACCESS_TOKEN) {
  throw new Error(
    "❌ Mungon SHOPIFY_ACCESS_TOKEN në .env"
  );
}

if (!GOOGLE_API_KEY) {
  throw new Error(
    "❌ Mungon GOOGLE_API_KEY në .env"
  );
}

if (!GOOGLE_CX) {
  throw new Error(
    "❌ Mungon GOOGLE_CX në .env"
  );
}


// ======================================================
// SHOPIFY GRAPHQL
// ======================================================

async function shopifyGraphQL(
  query,
  variables = {}
) {

  const response = await axios.post(
    SHOPIFY_URL,

    {
      query,
      variables
    },

    {
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token":
          SHOPIFY_ACCESS_TOKEN
      },

      timeout: 30000
    }
  );


  if (response.data.errors) {

    console.error(
      "❌ SHOPIFY GRAPHQL ERROR:"
    );

    console.error(
      JSON.stringify(
        response.data.errors,
        null,
        2
      )
    );

    throw new Error(
      "Shopify GraphQL error"
    );
  }


  return response.data.data;
}


// ======================================================
// GJEJ PRODUKTIN SIPAS SKU
// ======================================================

async function findProductBySKU(sku) {

  const query = `
    query FindProduct($query: String!) {

      productVariants(
        first: 1
        query: $query
      ) {

        nodes {

          sku

          product {

            id

            title

            description

            media(first: 20) {

              nodes {

                id

                mediaContentType

                ... on MediaImage {

                  image {
                    url
                  }

                }

              }

            }

          }

        }

      }

    }
  `;


  const data =
    await shopifyGraphQL(
      query,
      {
        query: `sku:${sku}`
      }
    );


  const variant =
    data?.productVariants?.nodes?.[0];


  if (!variant) {
    return null;
  }


  return variant;
}


// ======================================================
// PASTRO TEKSTIN
// ======================================================

function cleanText(text) {

  if (!text) {
    return "";
  }


  return text

    .replace(
      /<[^>]*>/g,
      " "
    )

    .replace(
      /&nbsp;/gi,
      " "
    )

    .replace(
      /&amp;/gi,
      "&"
    )

    .replace(
      /\s+/g,
      " "
    )

    .trim();
}


// ======================================================
// KRIJO QUERY PËR GOOGLE
// ======================================================

function createSearchQuery(
  title,
  description
) {

  const cleanTitle =
    cleanText(title);

  const cleanDescription =
    cleanText(description);


  /*
    Titulli është pjesa kryesore.

    Përshkrimi përdoret për të kuptuar
    më mirë llojin e produktit.
  */

  const descriptionWords =
    cleanDescription
      .split(/\s+/)
      .filter(
        word => word.length >= 4
      )
      .slice(0, 20)
      .join(" ");


  /*
    "square product photo" ndihmon
    Google të kthejë foto më afër 1:1.
  */

  return `
    ${cleanTitle}
    ${descriptionWords}
    product photo
    square
    1:1
  `.replace(/\s+/g, " ").trim();
}


// ======================================================
// GOOGLE IMAGE SEARCH
// ======================================================

async function searchGoogleImages(
  searchQuery
) {

  console.log(
    `🔎 GOOGLE: ${searchQuery}`
  );


  const response =
    await axios.get(
      "https://www.googleapis.com/customsearch/v1",
      {

        params: {

          key: GOOGLE_API_KEY,

          cx: GOOGLE_CX,

          q: searchQuery,

          searchType: "image",

          num: 10,

          safe: "active",

          imgSize: "large",

          imgType: "photo"

        },

        timeout: 30000

      }
    );


  return (
    response.data?.items || []
  );
}


// ======================================================
// SCORE PËR FOTO SQUARE
// ======================================================

function getSquareScore(item) {

  const width =
    Number(item.image?.width || 0);

  const height =
    Number(item.image?.height || 0);


  if (!width || !height) {
    return 0;
  }


  const ratio =
    width / height;


  /*
    1.00 = perfekte square

    Sa më larg 1.00,
    aq më pak pikë.
  */

  const difference =
    Math.abs(
      1 - ratio
    );


  if (difference <= 0.03) {
    return 10;
  }


  if (difference <= 0.08) {
    return 7;
  }


  if (difference <= 0.15) {
    return 4;
  }


  if (difference <= 0.25) {
    return 1;
  }


  return 0;
}


// ======================================================
// ZGJIDH FOTON MË TË MIRË
// ======================================================

function chooseBestImage(
  results,
  title
) {

  if (!results.length) {
    return null;
  }


  const titleWords =
    cleanText(title)
      .toLowerCase()
      .split(/\s+/)
      .filter(
        word => word.length >= 4
      );


  const scored =
    results.map(item => {

      const text = `

        ${item.title || ""}

        ${item.snippet || ""}

        ${item.displayLink || ""}

      `.toLowerCase();


      let score = 0;


      // ----------------------------------------------
      // PËRPUTHJA ME TITULLIN
      // ----------------------------------------------

      for (
        const word of titleWords
      ) {

        if (
          text.includes(word)
        ) {

          score += 2;

        }

      }


      // ----------------------------------------------
      // SQUARE SCORE
      // ----------------------------------------------

      const squareScore =
        getSquareScore(item);


      score += squareScore;


      // ----------------------------------------------
      // REZOLUCIONI
      // ----------------------------------------------

      const width =
        Number(
          item.image?.width || 0
        );

      const height =
        Number(
          item.image?.height || 0
        );


      if (
        width >= 800 &&
        height >= 800
      ) {

        score += 3;

      }


      return {

        item,

        score,

        squareScore,

        width,

        height

      };

    });


  // Më i miri i pari

  scored.sort(
    (a, b) =>
      b.score - a.score
  );


  const best =
    scored[0];


  console.log(
    `⭐ SCORE: ${best.score}`
  );

  console.log(
    `📐 DIMENSIONS: ${best.width}x${best.height}`
  );

  console.log(
    `⬛ SQUARE SCORE: ${best.squareScore}/10`
  );


  return best.item;
}


// ======================================================
// SHTO FOTO NË SHOPIFY
// ======================================================

async function addImageToShopify(
  productId,
  imageUrl,
  altText
) {

  const mutation = `

    mutation AddProductImage(

      $productId: ID!

      $media: [CreateMediaInput!]!

    ) {

      productCreateMedia(

        productId: $productId

        media: $media

      ) {

        media {

          id

          alt

          status

          mediaContentType

          ... on MediaImage {

            image {

              url

            }

          }

        }

        mediaUserErrors {

          field

          message

        }

      }

    }

  `;


  const data =
    await shopifyGraphQL(

      mutation,

      {

        productId,

        media: [

          {

            originalSource:
              imageUrl,

            alt:
              altText,

            mediaContentType:
              "IMAGE"

          }

        ]

      }

    );


  const result =
    data.productCreateMedia;


  // ----------------------------------------------
  // ERROR
  // ----------------------------------------------

  if (
    result.mediaUserErrors?.length
  ) {

    console.error(
      "❌ SHOPIFY IMAGE ERROR:"
    );

    console.error(
      JSON.stringify(
        result.mediaUserErrors,
        null,
        2
      )
    );

    return false;
  }


  // ----------------------------------------------
  // SUCCESS
  // ----------------------------------------------

  if (
    result.media?.length
  ) {

    console.log(
      "✅ FOTO U NGARKUA NË SHOPIFY!"
    );

    return true;

  }


  console.log(
    "❌ Shopify nuk e ngarkoi foton."
  );


  return false;
}


// ======================================================
// PROCESS SKU
// ======================================================

async function processSKU(
  sku
) {

  console.log("");
  console.log(
    "======================================"
  );

  console.log(
    `📦 SKU: ${sku}`
  );

  console.log(
    "======================================"
  );


  try {

    // ----------------------------------------------
    // 1. GJEJ PRODUKTIN
    // ----------------------------------------------

    const variant =
      await findProductBySKU(
        sku
      );


    if (!variant) {

      console.log(
        `❌ SKU ${sku} nuk u gjet në Shopify`
      );

      return {
        sku,
        status: "NOT_FOUND"
      };

    }


    const product =
      variant.product;


    console.log(
      `📌 TITULLI: ${product.title}`
    );


    // ----------------------------------------------
    // 2. KONTROLLO FOTOT
    // ----------------------------------------------

    const existingImages =
      product.media.nodes.filter(
        media =>
          media.mediaContentType ===
          "IMAGE"
      );


    if (
      existingImages.length > 0
    ) {

      console.log(
        `⏭️ ${sku} ka tashmë foto → SKIP`
      );

      return {

        sku,

        status:
          "ALREADY_HAS_IMAGE"

      };

    }


    // ----------------------------------------------
    // 3. KRIJO SEARCH
    // ----------------------------------------------

    const searchQuery =
      createSearchQuery(

        product.title,

        product.description

      );


    // ----------------------------------------------
    // 4. GOOGLE
    // ----------------------------------------------

    const results =
      await searchGoogleImages(
        searchQuery
      );


    if (!results.length) {

      console.log(
        `⚠️ Nuk u gjet foto për ${sku}`
      );

      return {

        sku,

        status:
          "NO_IMAGE_FOUND"

      };

    }


    // ----------------------------------------------
    // 5. ZGJIDH MË TË MIRËN
    // ----------------------------------------------

    const bestImage =
      chooseBestImage(

        results,

        product.title

      );


    if (!bestImage) {

      return {

        sku,

        status:
          "NO_RELIABLE_IMAGE"

      };

    }


    console.log(
      `🖼️ IMAGE URL:`
    );

    console.log(
      bestImage.link
    );


    console.log(
      `🌐 SOURCE: ${bestImage.displayLink || "unknown"}`
    );


    // ----------------------------------------------
    // 6. NGARKO NË SHOPIFY
    // ----------------------------------------------

    const uploaded =
      await addImageToShopify(

        product.id,

        bestImage.link,

        product.title

      );


    if (!uploaded) {

      return {

        sku,

        status:
          "UPLOAD_FAILED"

      };

    }


    return {

      sku,

      status:
        "SUCCESS",

      image:
        bestImage.link

    };


  } catch (error) {

    console.error(
      `❌ ERROR ${sku}:`
    );

    console.error(
      error.response?.data ||
      error.message
    );


    return {

      sku,

      status:
        "ERROR",

      error:
        error.message

    };

  }

}


// ======================================================
// MAIN
// ======================================================

async function main() {

  console.log("");
  console.log(
    "======================================"
  );

  console.log(
    "🖼️ SHOPIFY AUTO IMAGE SYSTEM"
  );

  console.log(
    "⬛ SQUARE IMAGE TEST"
  );

  console.log(
    "======================================"
  );

  console.log(
    `📦 SKU për test: ${TEST_SKUS.length}`
  );

  console.log(
    "======================================"
  );


  const results = [];


  // ====================================================
  // PROCESS ONE BY ONE
  // ====================================================

  for (
    const sku of TEST_SKUS
  ) {

    const result =
      await processSKU(
        sku
      );


    results.push(
      result
    );


    // Delay
    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          1500
        )
    );

  }


  // ====================================================
  // FINAL REPORT
  // ====================================================

  console.log("");
  console.log("");
  console.log(
    "======================================"
  );

  console.log(
    "📊 FINAL REPORT"
  );

  console.log(
    "======================================"
  );


  for (
    const result of results
  ) {

    console.log(
      `${result.sku} → ${result.status}`
    );


    if (
      result.image
    ) {

      console.log(
        `   🖼️ ${result.image}`
      );

    }


    if (
      result.error
    ) {

      console.log(
        `   ❌ ${result.error}`
      );

    }

  }


  console.log(
    "======================================"
  );

  console.log(
    "🏁 TEST FINISHED"
  );

  console.log(
    "======================================"
  );

}


// ======================================================
// START
// ======================================================

main();
}
