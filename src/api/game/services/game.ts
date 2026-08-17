/**
 * game service
 */

import { factories } from "@strapi/strapi";
import axios from "axios";
import { JSDOM } from "jsdom";
import slugify from "slugify";

const gameService = "api::game.game";
const publisherService = "api::publisher.publisher";
const developerService = "api::developer.developer";
const categoryService = "api::category.category";
const platformService = "api::platform.platform";

type GogProduct = {
  title: string;
  slug: string;
  developers: string[];
  publishers: string[];
  genres: { name: string }[];
  operatingSystems: string[];
  releaseDate: string | number;
  price: {
    finalMoney: {
      amount: string | number;
    };
  };
};

async function getGameInfo(slug: string) {
  const gogSlug = slug.replace(/-/g, "_").toLowerCase();
  const body = await axios.get(`https://www.gog.com/game/${gogSlug}`);
  const dom = new JSDOM(body.data);

  const raw_description = dom.window.document.querySelector(".description");
  const description = raw_description?.innerHTML;
  const short_description = raw_description?.textContent?.slice(0, 160).trim();
  const ratingElement = dom.window.document.querySelector(
    ".age-restrictions__icon use",
  );

  return {
    description,
    short_description,
    rating: ratingElement
      ? ratingElement
          ?.getAttribute("xlink:href")
          ?.replace(/_/g, "")
          .replace("#", "")
      : "BR0",
  };
}

async function getByName(name: string, entityService: any) {
  const item = await strapi.service(entityService).find({
    filters: {
      name,
    },
  });

  return item.results.length > 0 ? item.results[0] : null;
}

async function create(name: string, entityService: any) {
  const item = await getByName(name, entityService);
  if (!item) {
    return await strapi.service(entityService).create({
      data: {
        name,
        slug: slugify(name, { strict: true, lower: true }),
      },
    });
  }
}

async function createManyToManyData(products: GogProduct[]) {
    const developersSet = new Set<string>();
    const publishersSet = new Set<string>();
    const categoriesSet = new Set<string>();
    const platformsSet = new Set<string>();
  
    products.forEach((product) => {
      const { developers, publishers, genres, operatingSystems } = product;
  
      genres?.forEach(({ name }) => {
        categoriesSet.add(name);
      });
  
      operatingSystems?.forEach((item) => {
        platformsSet.add(item);
      });
  
      developers?.forEach((item) => {
        developersSet.add(item);
      });
  
      publishers?.forEach((item) => {
        publishersSet.add(item);
      });
    });
  
    const createCall = (set: Set<string>, entityName: string) =>
      Array.from(set).map((name) => create(name, entityName));
  
    return Promise.all([
      ...createCall(developersSet, developerService),
      ...createCall(publishersSet, publisherService),
      ...createCall(categoriesSet, categoryService),
      ...createCall(platformsSet, platformService),
    ]);
  }
  
  async function createGames(products: GogProduct[]) {
    await Promise.all(
      products.map(async (product) => {
        const item = await getByName(product.title, gameService);

        if (!item) {
          console.info(`Creating: ${product.title}...`);

          return strapi.service(`${gameService}`).create({
            data: {
              name: product.title,
              slug: product.slug,
              price: product.price.finalMoney.amount,
              release_date: new Date(product.releaseDate),
              categories: await Promise.all(
                product.genres.map(({ name }) => getByName(name, categoryService))
              ),
              platforms: await Promise.all(
                product.operatingSystems.map((name) =>
                  getByName(name, platformService)
                )
              ),
              developers: await Promise.all(
                product.developers.map((name) =>
                  getByName(name, developerService)
                )
              ),
              publisher: await Promise.all(
                product.publishers.map((name) =>
                  getByName(name, publisherService)
                )
              ),
              ...(await getGameInfo(product.slug)),
              publishedAt: new Date(),
            },
          });
        }
      })
    );
  }

  

export default factories.createCoreService("api::game.game", () => ({
  async populate(params) {
    const gogApiUrl =
      "https://catalog.gog.com/v1/catalog?limit=48&order=desc%3Atrending";

    const {
      data: { products },
    } = await axios.get(gogApiUrl);

    
    await createManyToManyData([products[0], products[2]]);
    await createGames([products[0], products[2]]);
  },
}));
