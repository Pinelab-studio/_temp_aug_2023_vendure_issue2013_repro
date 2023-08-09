import {
    createTestEnvironment,
    registerInitializer,
    SimpleGraphQLClient,
    SqljsInitializer,
    testConfig
  } from "@vendure/testing";
  import {
    ActiveOrderService,
    ChannelService,
    DefaultLogger, EntityHydrator,
    LogLevel,
    mergeConfig, Order,
    RequestContext
  } from "@vendure/core";
  import { TestServer } from "@vendure/testing/lib/test-server";
  import { gql } from "graphql-tag";
  import { expect, describe, beforeAll, it} from 'vitest'
  
  
  import { LanguageCode } from '@vendure/common/lib/generated-types';
  import { InitialData } from '@vendure/core';
  
  const initialData: InitialData = {
    defaultLanguage: LanguageCode.en,
    defaultZone: 'Europe',
    taxRates: [
      { name: 'Standard Tax', percentage: 20 },
      { name: 'Reduced Tax', percentage: 10 },
      { name: 'Zero Tax', percentage: 0 },
    ],
    shippingMethods: [
      { name: 'Standard Shipping', price: 500 },
      { name: 'Express Shipping', price: 1000 },
    ],
    countries: [
      { name: 'Australia', code: 'AU', zone: 'Oceania' },
      { name: 'Austria', code: 'AT', zone: 'Europe' },
      { name: 'Canada', code: 'CA', zone: 'Americas' },
      { name: 'China', code: 'CN', zone: 'Asia' },
      { name: 'South Africa', code: 'ZA', zone: 'Africa' },
      { name: 'United Kingdom', code: 'GB', zone: 'Europe' },
      { name: 'United States of America', code: 'US', zone: 'Americas' },
      { name: 'Nederland', code: 'NL', zone: 'Europe' },
    ],
    collections: [
      {
        name: 'Plants',
        filters: [
          {
            code: 'facet-value-filter',
            args: { facetValueNames: ['plants'], containsAny: false },
          },
        ],
      },
    ],
    paymentMethods: [],
    /*  paymentMethods: [
      {
        name: testPaymentMethod.code,
        handler: { code: testPaymentMethod.code, arguments: [] },
      },
    ],*/
  };
  
  const ADD_ITEM_TO_ORDER = gql`
      mutation AddItemToOrder(
          $productVariantId: ID!
          $quantity: Int!
      ) {
          addItemToOrder(
              productVariantId: $productVariantId
              quantity: $quantity
          ) {
              ... on Order {
                  id
                  code
              }
              ... on ErrorResult {
                  errorCode
                  message
              }
          }
      }
  `;
  
  describe("Hydration issue", function() {
    let server: TestServer;
    let adminClient: SimpleGraphQLClient;
    let shopClient: SimpleGraphQLClient;
  
    beforeAll(async () => {
      registerInitializer("sqljs", new SqljsInitializer("__data__"));
      const config = mergeConfig(testConfig, {
        logger: new DefaultLogger({ level: LogLevel.Debug }),
        plugins: []
      });
      ({ server, adminClient, shopClient } = createTestEnvironment(config));
      await server.init({
        initialData,
        // productsCsvPath: `${__dirname}/subscriptions.csv`
        productsCsvPath: './products.csv',
      });
    }, 60000);
  
    let order: Order | undefined;
  
    it("Create order with 3 items", async () => {
      await shopClient.asUserWithCredentials(
        "hayden.zieme12@hotmail.com",
        "test"
      );
      await shopClient.query(ADD_ITEM_TO_ORDER, {
        productVariantId: "1",
        quantity: 1
      });
      await shopClient.query(ADD_ITEM_TO_ORDER, {
        productVariantId: "2",
        quantity: 1
      });
      await shopClient.query(ADD_ITEM_TO_ORDER, {
        productVariantId: "3",
        quantity: 1
      });
      const channel = await server.app.get(ChannelService).getDefaultChannel();
      // This is ugly, but in our real life example we use a CTX constructed by Vendure
      const ctx = new RequestContext({
        channel,
        authorizedAsOwnerOnly: true,
        apiType: "shop",
        isAuthorized: true,
        session: {
          activeOrderId: 1,
          activeChannelId: 1,
          user: {
            id: 2
          }
        } as any
      });
      order = await server.app.get(ActiveOrderService).getActiveOrder(ctx, undefined);
      await server.app.get(EntityHydrator).hydrate(ctx, order!, {
        relations: ["lines.productVariant"],
        applyProductVariantPrices: true
      });
    });
  
    it("Variant of orderLine 1 has a price", async () => {
      expect(order!.lines[0].productVariant.priceWithTax).toBeGreaterThan(0);
    });
  
    it("Variant of orderLine 2 has a price", async () => {
      expect(order!.lines[1].productVariant.priceWithTax).toBeGreaterThan(0);
    });
  
    it("Variant of orderLine 3 has a price", async () => {
      expect(order!.lines[1].productVariant.priceWithTax).toBeGreaterThan(0);
    });
  });